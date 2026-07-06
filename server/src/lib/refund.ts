import { assertTransition, events, pledges, vaults } from "@squadvault/shared";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { stripe } from "./stripe.js";

/** Voids every active hold and moves the vault to refunded. Used on rejection or when nobody's left to fund. */
export async function refundAllPledges(vaultId: string) {
  const [vault] = await db.select().from(vaults).where(eq(vaults.id, vaultId));
  if (!vault) return null;

  const vaultPledges = await db.select().from(pledges).where(eq(pledges.vaultId, vaultId));
  for (const p of vaultPledges) {
    if (p.holdStatus === "voided" || p.holdStatus === "captured") continue;
    if (p.stripePaymentIntentId) {
      try {
        await stripe.paymentIntents.cancel(p.stripePaymentIntentId);
      } catch {
        // already canceled or otherwise unusable — fall through and mark voided regardless
      }
    }
    await db
      .update(pledges)
      .set({ holdStatus: "voided", updatedAt: new Date() })
      .where(eq(pledges.id, p.id));
  }

  assertTransition(vault.status, "refunding");
  await db.update(vaults).set({ status: "refunding", updatedAt: new Date() }).where(eq(vaults.id, vaultId));
  await db.insert(events).values({ vaultId, type: "vault.refunding_started", payload: {} });

  assertTransition("refunding", "refunded");
  const [refunded] = await db
    .update(vaults)
    .set({ status: "refunded", pauseReason: null, pendingGoalAmountCents: null, updatedAt: new Date() })
    .where(eq(vaults.id, vaultId))
    .returning();
  await db.insert(events).values({ vaultId, type: "vault.refunded", payload: {} });

  return refunded;
}
