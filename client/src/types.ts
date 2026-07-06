import type { VaultStatus } from "@squadvault/shared";

/**
 * Mirrors the shape of the JSON the API actually sends (dates as ISO
 * strings, not Date objects) rather than importing the Drizzle/zod-inferred
 * types directly, since those model the DB row, not the wire format.
 */
export interface VaultDTO {
  id: string;
  leadId: string;
  title: string;
  goalAmountCents: number;
  bufferPct: string;
  deadline: string;
  merchantName: string;
  merchantMcc: string | null;
  status: VaultStatus;
  pauseReason: "price_jump" | "dropout" | null;
  pendingGoalAmountCents: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PledgeDTO {
  id: string;
  vaultId: string;
  userId: string;
  userName: string;
  userEmail: string;
  shareAmountCents: number;
  holdStatus: string;
  consentStatus: string;
  stripePaymentIntentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VaultEventDTO {
  id: string;
  vaultId: string;
  type: string;
  payload: unknown;
  createdAt: string;
}

export interface CardDTO {
  id: string;
  vaultId: string;
  isMocked: boolean;
  mccLocks: string[];
  last4: string | null;
  brand: string | null;
  expMonth: number | null;
  expYear: number | null;
  createdAt: string;
}
