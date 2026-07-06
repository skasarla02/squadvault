import { assertTransition, events, pledges, vaults } from "@squadvault/shared";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { tryFundVault } from "../lib/funding.js";
import { refundAllPledges } from "../lib/refund.js";
import { isStripeConfigured, stripe } from "../lib/stripe.js";
import { requireAuth, requireDb } from "../middleware.js";

export const pledgesRouter = Router();

pledgesRouter.use(requireDb, requireAuth);

/** Creates (or reuses) a Stripe PaymentIntent hold for this pledge's share, manual capture. */
pledgesRouter.post("/:id/create-intent", async (req, res) => {
  if (!isStripeConfigured) {
    return res.status(503).json({ error: "Stripe is not configured. Set STRIPE_SECRET_KEY in server/.env." });
  }

  const [pledge] = await db.select().from(pledges).where(eq(pledges.id, req.params.id));
  if (!pledge) return res.status(404).json({ error: "Pledge not found" });
  if (pledge.userId !== req.session.userId) {
    return res.status(403).json({ error: "You can only authorize your own pledge" });
  }
  if (pledge.holdStatus === "authorized" || pledge.holdStatus === "captured") {
    return res.status(409).json({ error: "This pledge is already authorized" });
  }

  const [vault] = await db.select().from(vaults).where(eq(vaults.id, pledge.vaultId));
  if (!vault) return res.status(404).json({ error: "Vault not found" });
  if (vault.status !== "collecting") {
    return res.status(409).json({ error: "This vault isn't collecting pledges right now" });
  }
  if (new Date() > new Date(vault.deadline)) {
    return res.status(409).json({ error: "The funding deadline has passed" });
  }

  const intent = await stripe.paymentIntents.create({
    amount: pledge.shareAmountCents,
    currency: "usd",
    capture_method: "manual",
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: { pledgeId: pledge.id, vaultId: vault.id },
  });

  await db
    .update(pledges)
    .set({ stripePaymentIntentId: intent.id, updatedAt: new Date() })
    .where(eq(pledges.id, pledge.id));

  res.json({ clientSecret: intent.client_secret });
});

/** Client calls this after Stripe confirms the hold client-side, to sync our DB + check funding. */
pledgesRouter.post("/:id/confirm", async (req, res) => {
  const [pledge] = await db.select().from(pledges).where(eq(pledges.id, req.params.id));
  if (!pledge) return res.status(404).json({ error: "Pledge not found" });
  if (pledge.userId !== req.session.userId) {
    return res.status(403).json({ error: "You can only confirm your own pledge" });
  }
  if (!pledge.stripePaymentIntentId) {
    return res.status(409).json({ error: "No payment intent to confirm" });
  }

  const intent = await stripe.paymentIntents.retrieve(pledge.stripePaymentIntentId);
  if (intent.status !== "requires_capture") {
    return res.status(409).json({ error: `Hold isn't authorized yet (Stripe status: ${intent.status})` });
  }

  const [updated] = await db
    .update(pledges)
    .set({ holdStatus: "authorized", updatedAt: new Date() })
    .where(eq(pledges.id, pledge.id))
    .returning();

  await db.insert(events).values({
    vaultId: pledge.vaultId,
    type: "pledge.authorized",
    payload: { pledgeId: pledge.id, shareAmountCents: pledge.shareAmountCents },
  });

  const vault = await tryFundVault(pledge.vaultId);

  res.json({ pledge: updated, vault });
});

/** Last-Minute Dropout: member voids their own hold; their share is redistributed and the rest must re-consent. */
pledgesRouter.post("/:id/leave", async (req, res) => {
  const [pledge] = await db.select().from(pledges).where(eq(pledges.id, req.params.id));
  if (!pledge) return res.status(404).json({ error: "Pledge not found" });
  if (pledge.userId !== req.session.userId) {
    return res.status(403).json({ error: "You can only leave your own pledge" });
  }
  if (pledge.holdStatus === "voided") {
    return res.status(409).json({ error: "You've already left this vault" });
  }

  const [vault] = await db.select().from(vaults).where(eq(vaults.id, pledge.vaultId));
  if (!vault) return res.status(404).json({ error: "Vault not found" });
  if (vault.status !== "collecting" && vault.status !== "funded") {
    return res.status(409).json({ error: "You can't leave once the vault has moved past collecting" });
  }

  if (pledge.stripePaymentIntentId) {
    try {
      await stripe.paymentIntents.cancel(pledge.stripePaymentIntentId);
    } catch {
      // already uncancelable — proceed to mark voided regardless
    }
  }
  await db
    .update(pledges)
    .set({ holdStatus: "voided", stripePaymentIntentId: null, updatedAt: new Date() })
    .where(eq(pledges.id, pledge.id));

  await db.insert(events).values({
    vaultId: vault.id,
    type: "pledge.dropout",
    payload: { pledgeId: pledge.id, shareAmountCents: pledge.shareAmountCents },
  });

  const remaining = (await db.select().from(pledges).where(eq(pledges.vaultId, vault.id))).filter(
    (p) => p.holdStatus !== "voided"
  );

  if (remaining.length === 0) {
    const refunded = await refundAllPledges(vault.id);
    return res.json({ vault: refunded });
  }

  const bonus = Math.floor(pledge.shareAmountCents / remaining.length);
  const remainder = pledge.shareAmountCents - bonus * remaining.length;

  for (const [i, p] of remaining.entries()) {
    if (p.stripePaymentIntentId) {
      try {
        await stripe.paymentIntents.cancel(p.stripePaymentIntentId);
      } catch {
        // already uncancelable — proceed to reset regardless
      }
    }
    await db
      .update(pledges)
      .set({
        shareAmountCents: p.shareAmountCents + bonus + (i === 0 ? remainder : 0),
        holdStatus: "pending",
        stripePaymentIntentId: null,
        consentStatus: "pending",
        updatedAt: new Date(),
      })
      .where(eq(pledges.id, p.id));
  }

  assertTransition(vault.status, "paused");
  const [updated] = await db
    .update(vaults)
    .set({ status: "paused", pauseReason: "dropout", updatedAt: new Date() })
    .where(eq(vaults.id, vault.id))
    .returning();

  await db.insert(events).values({
    vaultId: vault.id,
    type: "vault.reshare_required",
    payload: { droppedShareCents: pledge.shareAmountCents, remainingCount: remaining.length, perPersonBonusCents: bonus },
  });

  res.json({ vault: updated });
});

const consentSchema = z.object({ approve: z.boolean() });

/** Shared consent handler for both the price-jump top-up and the post-dropout reshare. */
pledgesRouter.post("/:id/consent", async (req, res) => {
  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [pledge] = await db.select().from(pledges).where(eq(pledges.id, req.params.id));
  if (!pledge) return res.status(404).json({ error: "Pledge not found" });
  if (pledge.userId !== req.session.userId) {
    return res.status(403).json({ error: "You can only respond for your own pledge" });
  }
  if (pledge.consentStatus !== "pending") {
    return res.status(409).json({ error: "No consent is pending for this pledge" });
  }

  const [vault] = await db.select().from(vaults).where(eq(vaults.id, pledge.vaultId));
  if (!vault || vault.status !== "paused") {
    return res.status(409).json({ error: "This vault isn't awaiting consent right now" });
  }

  const isTopUp = vault.pauseReason === "price_jump";

  if (!parsed.data.approve) {
    await db
      .update(pledges)
      .set({ consentStatus: "rejected", updatedAt: new Date() })
      .where(eq(pledges.id, pledge.id));
    await db.insert(events).values({
      vaultId: vault.id,
      type: isTopUp ? "pledge.topup_rejected" : "pledge.reshare_rejected",
      payload: { pledgeId: pledge.id },
    });
    const refunded = await refundAllPledges(vault.id);
    return res.json({ vault: refunded });
  }

  await db
    .update(pledges)
    .set({ consentStatus: "approved", updatedAt: new Date() })
    .where(eq(pledges.id, pledge.id));
  await db.insert(events).values({
    vaultId: vault.id,
    type: isTopUp ? "pledge.topup_approved" : "pledge.reshare_approved",
    payload: { pledgeId: pledge.id, shareAmountCents: pledge.shareAmountCents },
  });

  const allPledges = await db.select().from(pledges).where(eq(pledges.vaultId, vault.id));
  const active = allPledges.filter((p) => p.holdStatus !== "voided");
  const allApproved = active.length > 0 && active.every((p) => p.consentStatus === "approved");

  let updatedVault = vault;
  if (allApproved) {
    assertTransition(vault.status, "collecting");
    if (isTopUp && vault.pendingGoalAmountCents) {
      const [v] = await db
        .update(vaults)
        .set({
          status: "collecting",
          goalAmountCents: vault.pendingGoalAmountCents,
          pendingGoalAmountCents: null,
          pauseReason: null,
          updatedAt: new Date(),
        })
        .where(eq(vaults.id, vault.id))
        .returning();
      updatedVault = v;
      await db.insert(events).values({
        vaultId: vault.id,
        type: "vault.resumed_after_topup",
        payload: { newGoalAmountCents: vault.pendingGoalAmountCents },
      });
    } else {
      const [v] = await db
        .update(vaults)
        .set({ status: "collecting", pauseReason: null, updatedAt: new Date() })
        .where(eq(vaults.id, vault.id))
        .returning();
      updatedVault = v;
      await db.insert(events).values({ vaultId: vault.id, type: "vault.resumed_after_reshare", payload: {} });
    }
  }

  res.json({ vault: updatedVault });
});
