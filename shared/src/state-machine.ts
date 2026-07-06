/**
 * The escrow lifecycle. This is the single source of truth for which
 * transitions are legal — the server enforces it, and the public Logic
 * Simulator replays it, so both must import from here rather than
 * re-encoding the rules.
 */
export const VAULT_STATUSES = [
  "draft",
  "collecting",
  "funded",
  "paused",
  "executing",
  "completed",
  "refunding",
  "refunded",
  "cancelled",
] as const;

export type VaultStatus = (typeof VAULT_STATUSES)[number];

export const VALID_TRANSITIONS: Record<VaultStatus, VaultStatus[]> = {
  draft: ["collecting", "cancelled"],
  collecting: ["funded", "paused", "refunding", "cancelled"],
  funded: ["paused", "executing", "refunding"],
  paused: ["funded", "collecting", "refunding"],
  executing: ["completed", "refunding"],
  completed: [],
  refunding: ["refunded"],
  refunded: [],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: VaultStatus, to: VaultStatus) {
    super(`Illegal vault transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: VaultStatus, to: VaultStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: VaultStatus, to: VaultStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/**
 * Event types written to the audit log. Kept as a union (rather than a DB
 * enum) since the log is meant to be append-only and forgiving of new
 * event kinds — but this union is what the simulator and UI switch on.
 */
export const VAULT_EVENT_TYPES = [
  "vault.created",
  "vault.collecting_started",
  "pledge.added",
  "pledge.authorized",
  "vault.funded",
  "vault.price_checked",
  "vault.paused_price_jump",
  "pledge.topup_approved",
  "pledge.topup_rejected",
  "vault.resumed_after_topup",
  "pledge.dropout",
  "vault.reshare_required",
  "pledge.reshare_approved",
  "pledge.reshare_rejected",
  "vault.resumed_after_reshare",
  "vault.executing_started",
  "card.issued",
  "vault.merchant_declined",
  "vault.proof_of_funds_generated",
  "vault.reimbursement_released",
  "vault.completed",
  "vault.refunding_started",
  "vault.refunded",
  "vault.cancelled",
] as const;

export type VaultEventType = (typeof VAULT_EVENT_TYPES)[number];
