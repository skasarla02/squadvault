import { assertTransition, events, pledges, vaults } from "@squadvault/shared";
import { eq } from "drizzle-orm";
import { db } from "../db.js";

/**
 * All-or-nothing trigger: once authorized pledge holds cover the goal amount,
 * the vault moves collecting -> funded. Called after every pledge authorization.
 */
export async function tryFundVault(vaultId: string) {
  const [vault] = await db.select().from(vaults).where(eq(vaults.id, vaultId));
  if (!vault || vault.status !== "collecting") return vault ?? null;

  const vaultPledges = await db.select().from(pledges).where(eq(pledges.vaultId, vaultId));
  const authorizedTotal = vaultPledges
    .filter((p) => p.holdStatus === "authorized")
    .reduce((sum, p) => sum + p.shareAmountCents, 0);

  if (authorizedTotal < vault.goalAmountCents) return vault;

  assertTransition(vault.status, "funded");
  const [updated] = await db
    .update(vaults)
    .set({ status: "funded", updatedAt: new Date() })
    .where(eq(vaults.id, vaultId))
    .returning();

  await db.insert(events).values({ vaultId, type: "vault.funded", payload: { totalCents: authorizedTotal } });

  return updated;
}
