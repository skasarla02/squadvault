import { assertTransition, cards, events, insertVaultSchema, pledges, users, vaults } from "@squadvault/shared";
import { eq, or } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { issueCard, simulateAuthorization } from "../lib/cards.js";
import { generateProofOfFundsPdf } from "../lib/pdf.js";
import { stripe } from "../lib/stripe.js";
import { requireAuth, requireDb } from "../middleware.js";

export const vaultsRouter = Router();

vaultsRouter.use(requireDb, requireAuth);

vaultsRouter.post("/", async (req, res) => {
  const parsed = insertVaultSchema.safeParse({ ...req.body, leadId: req.session.userId });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [vault] = await db.insert(vaults).values(parsed.data).returning();
  await db.insert(events).values({
    vaultId: vault.id,
    type: "vault.created",
    payload: { title: vault.title, goalAmountCents: vault.goalAmountCents },
  });

  res.status(201).json({ vault });
});

vaultsRouter.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const rows = await db
    .selectDistinct({ vault: vaults })
    .from(vaults)
    .leftJoin(pledges, eq(pledges.vaultId, vaults.id))
    .where(or(eq(vaults.leadId, userId), eq(pledges.userId, userId)));

  res.json({ vaults: rows.map((r) => r.vault) });
});

vaultsRouter.get("/:id", async (req, res) => {
  const [vault] = await db.select().from(vaults).where(eq(vaults.id, req.params.id));
  if (!vault) return res.status(404).json({ error: "Vault not found" });

  const vaultPledges = await db
    .select({
      id: pledges.id,
      vaultId: pledges.vaultId,
      userId: pledges.userId,
      shareAmountCents: pledges.shareAmountCents,
      holdStatus: pledges.holdStatus,
      consentStatus: pledges.consentStatus,
      stripePaymentIntentId: pledges.stripePaymentIntentId,
      createdAt: pledges.createdAt,
      updatedAt: pledges.updatedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(pledges)
    .innerJoin(users, eq(pledges.userId, users.id))
    .where(eq(pledges.vaultId, vault.id));

  const vaultEvents = await db.select().from(events).where(eq(events.vaultId, vault.id));
  const vaultCards = await db.select().from(cards).where(eq(cards.vaultId, vault.id));

  res.json({ vault, pledges: vaultPledges, events: vaultEvents, cards: vaultCards });
});

/** Lead moves a draft vault into collecting once members/shares are set. */
vaultsRouter.post("/:id/start-collecting", async (req, res) => {
  const [vault] = await db.select().from(vaults).where(eq(vaults.id, req.params.id));
  if (!vault) return res.status(404).json({ error: "Vault not found" });
  if (vault.leadId !== req.session.userId) {
    return res.status(403).json({ error: "Only the vault lead can start collecting" });
  }

  try {
    assertTransition(vault.status, "collecting");
  } catch (err) {
    return res.status(409).json({ error: (err as Error).message });
  }

  const [updated] = await db
    .update(vaults)
    .set({ status: "collecting", updatedAt: new Date() })
    .where(eq(vaults.id, vault.id))
    .returning();

  await db.insert(events).values({
    vaultId: vault.id,
    type: "vault.collecting_started",
    payload: {},
  });

  res.json({ vault: updated });
});

const addPledgeSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  shareAmountCents: z.coerce.number().int().positive(),
});

/** Lead adds a member + their share. Creates the member's user record if they don't exist yet. */
vaultsRouter.post("/:id/pledges", async (req, res) => {
  const [vault] = await db.select().from(vaults).where(eq(vaults.id, req.params.id));
  if (!vault) return res.status(404).json({ error: "Vault not found" });
  if (vault.leadId !== req.session.userId) {
    return res.status(403).json({ error: "Only the vault lead can add members" });
  }
  if (vault.status !== "draft" && vault.status !== "collecting") {
    return res.status(409).json({ error: "Can't add members once the vault has moved past collecting" });
  }

  const parsed = addPledgeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, email, shareAmountCents } = parsed.data;

  const [existingUser] = await db.select().from(users).where(eq(users.email, email));
  const member = existingUser ?? (await db.insert(users).values({ name, email }).returning())[0];

  const [pledge] = await db
    .insert(pledges)
    .values({ vaultId: vault.id, userId: member.id, shareAmountCents })
    .returning();

  await db.insert(events).values({
    vaultId: vault.id,
    type: "pledge.added",
    payload: { userId: member.id, shareAmountCents },
  });

  res.status(201).json({ pledge: { ...pledge, userName: member.name, userEmail: member.email } });
});

const checkPriceSchema = z.object({ newTotalCents: z.coerce.number().int().positive() });

/**
 * The Price Jump flow. Simulates the "poll merchant price before execution" step. If the new
 * total exceeds the buffer ceiling, pauses the vault and requires every member to re-consent to
 * a rescaled share before holds can be re-authorized.
 */
vaultsRouter.post("/:id/check-price", async (req, res) => {
  const parsed = checkPriceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [vault] = await db.select().from(vaults).where(eq(vaults.id, req.params.id));
  if (!vault) return res.status(404).json({ error: "Vault not found" });
  if (vault.leadId !== req.session.userId) {
    return res.status(403).json({ error: "Only the vault lead can check the price" });
  }
  if (vault.status !== "funded") {
    return res.status(409).json({ error: "Price can only be checked once the vault is funded" });
  }

  const { newTotalCents } = parsed.data;
  const ceilingCents = Math.round(vault.goalAmountCents * (1 + Number(vault.bufferPct) / 100));

  if (newTotalCents <= ceilingCents) {
    await db.insert(events).values({
      vaultId: vault.id,
      type: "vault.price_checked",
      payload: { newTotalCents, ceilingCents, withinBuffer: true },
    });
    return res.json({ vault, withinBuffer: true });
  }

  const activePledges = (await db.select().from(pledges).where(eq(pledges.vaultId, vault.id))).filter(
    (p) => p.holdStatus !== "voided"
  );
  const ratio = newTotalCents / vault.goalAmountCents;

  for (const p of activePledges) {
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
        shareAmountCents: Math.round(p.shareAmountCents * ratio),
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
    .set({ status: "paused", pauseReason: "price_jump", pendingGoalAmountCents: newTotalCents, updatedAt: new Date() })
    .where(eq(vaults.id, vault.id))
    .returning();

  await db.insert(events).values({
    vaultId: vault.id,
    type: "vault.paused_price_jump",
    payload: { newTotalCents, ceilingCents, perPersonMultiplier: ratio },
  });

  res.json({ vault: updated, withinBuffer: false });
});

const attemptExecutionSchema = z.object({ outcome: z.enum(["success", "declined"]) });

/**
 * Execution + Merchant Rejection flow. In place of real Stripe Issuing (mocked here per project
 * scope), the lead simulates the purchase attempt outcome. On success, holds are captured. On a
 * decline, funds are still captured but released to the lead as reimbursement, and a
 * Proof-of-Funds certificate becomes available.
 */
vaultsRouter.post("/:id/attempt-execution", async (req, res) => {
  const parsed = attemptExecutionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [vault] = await db.select().from(vaults).where(eq(vaults.id, req.params.id));
  if (!vault) return res.status(404).json({ error: "Vault not found" });
  if (vault.leadId !== req.session.userId) {
    return res.status(403).json({ error: "Only the vault lead can attempt execution" });
  }
  if (vault.status !== "funded") {
    return res.status(409).json({ error: "Vault must be funded before execution" });
  }

  assertTransition(vault.status, "executing");
  await db.update(vaults).set({ status: "executing", updatedAt: new Date() }).where(eq(vaults.id, vault.id));
  await db.insert(events).values({ vaultId: vault.id, type: "vault.executing_started", payload: {} });

  const [lead] = await db.select().from(users).where(eq(users.id, vault.leadId));

  let [card] = await db.select().from(cards).where(eq(cards.vaultId, vault.id));
  if (!card) {
    card = await issueCard({
      vaultId: vault.id,
      leadName: lead.name,
      leadEmail: lead.email,
      merchantName: vault.merchantName,
      limitCents: vault.goalAmountCents,
      acceptanceIp: req.ip ?? "127.0.0.1",
    });
    await db.insert(events).values({
      vaultId: vault.id,
      type: "card.issued",
      payload: { merchantName: vault.merchantName, mocked: card.isMocked, last4: card.last4 },
    });
  }

  const activePledges = (await db.select().from(pledges).where(eq(pledges.vaultId, vault.id))).filter(
    (p) => p.holdStatus === "authorized"
  );
  const totalCents = activePledges.reduce((sum, p) => sum + p.shareAmountCents, 0);

  // The lead's chosen demo outcome drives the actual transition — a real Issuing test
  // authorization is attempted alongside it purely for authenticity/logging, since its
  // result depends on the Issuing test balance having settled (which takes simulated time
  // independent of this request) and shouldn't make the demo's outcome unreliable.
  const approved = parsed.data.outcome === "success";
  const auth = await simulateAuthorization(card, totalCents, vault.merchantName, !approved);
  const authMatchesOutcome = auth ? auth.approved === approved : false;

  if (approved) {
    for (const p of activePledges) {
      if (p.stripePaymentIntentId) await stripe.paymentIntents.capture(p.stripePaymentIntentId);
      await db.update(pledges).set({ holdStatus: "captured", updatedAt: new Date() }).where(eq(pledges.id, p.id));
    }

    assertTransition("executing", "completed");
    const [completed] = await db
      .update(vaults)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(vaults.id, vault.id))
      .returning();
    await db.insert(events).values({ vaultId: vault.id, type: "vault.completed", payload: { merchantName: vault.merchantName } });

    return res.json({ vault: completed });
  }

  const errorCode = authMatchesOutcome ? (auth?.request_history?.[0]?.reason ?? "CARD_NOT_ACCEPTED") : "CARD_NOT_ACCEPTED";
  await db.insert(events).values({
    vaultId: vault.id,
    type: "vault.merchant_declined",
    payload: {
      merchantName: vault.merchantName,
      errorCode,
      timestamp: new Date().toISOString(),
      stripeVerified: authMatchesOutcome,
    },
  });
  await db.insert(events).values({ vaultId: vault.id, type: "vault.proof_of_funds_generated", payload: {} });

  for (const p of activePledges) {
    if (p.stripePaymentIntentId) await stripe.paymentIntents.capture(p.stripePaymentIntentId);
    await db.update(pledges).set({ holdStatus: "captured", updatedAt: new Date() }).where(eq(pledges.id, p.id));
  }
  await db.insert(events).values({
    vaultId: vault.id,
    type: "vault.reimbursement_released",
    payload: { leadId: vault.leadId, amountCents: totalCents },
  });

  assertTransition("executing", "completed");
  const [completed] = await db
    .update(vaults)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(vaults.id, vault.id))
    .returning();
  await db.insert(events).values({
    vaultId: vault.id,
    type: "vault.completed",
    payload: { merchantName: vault.merchantName, viaReimbursement: true },
  });

  res.json({ vault: completed });
});

/** Streams a freshly generated Proof-of-Funds PDF. Available to the lead or any pledged member. */
vaultsRouter.get("/:id/proof-of-funds.pdf", async (req, res) => {
  const [vault] = await db.select().from(vaults).where(eq(vaults.id, req.params.id));
  if (!vault) return res.status(404).json({ error: "Vault not found" });

  const vaultPledges = await db
    .select({
      userId: pledges.userId,
      userName: users.name,
      shareAmountCents: pledges.shareAmountCents,
      holdStatus: pledges.holdStatus,
    })
    .from(pledges)
    .innerJoin(users, eq(pledges.userId, users.id))
    .where(eq(pledges.vaultId, vault.id));

  const isMember = vault.leadId === req.session.userId || vaultPledges.some((p) => p.userId === req.session.userId);
  if (!isMember) return res.status(403).json({ error: "Not a member of this vault" });

  const pdfBytes = await generateProofOfFundsPdf(vault, vaultPledges);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="squadvault-proof-of-funds-${vault.id}.pdf"`);
  res.send(Buffer.from(pdfBytes));
});
