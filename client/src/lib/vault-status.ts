import type { VaultStatus } from "@squadvault/shared";
import type { BadgeProps } from "@/components/ui/badge";

export const VAULT_STATUS_VARIANT: Record<VaultStatus, NonNullable<BadgeProps["variant"]>> = {
  draft: "neutral",
  collecting: "primary",
  funded: "primary",
  paused: "warning",
  executing: "primary",
  completed: "primary",
  refunding: "destructive",
  refunded: "destructive",
  cancelled: "destructive",
};

export const VAULT_STATUS_LABEL: Record<VaultStatus, string> = {
  draft: "Draft",
  collecting: "Collecting",
  funded: "Funded",
  paused: "Paused",
  executing: "Executing",
  completed: "Completed",
  refunding: "Refunding",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export const PLEDGE_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  pending: "neutral",
  authorized: "primary",
  captured: "primary",
  voided: "destructive",
  failed: "destructive",
};
