import type { VaultStatus } from "@squadvault/shared";
import { VALID_TRANSITIONS } from "@squadvault/shared";

export const DIAGRAM_WIDTH = 940;
export const DIAGRAM_HEIGHT = 300;
export const NODE_WIDTH = 132;
export const NODE_HEIGHT = 46;

export const NODE_POSITIONS: Record<VaultStatus, { x: number; y: number; label: string }> = {
  draft: { x: 90, y: 40, label: "Draft" },
  collecting: { x: 280, y: 40, label: "Collecting" },
  funded: { x: 470, y: 40, label: "Funded" },
  executing: { x: 660, y: 40, label: "Executing" },
  completed: { x: 850, y: 40, label: "Completed" },
  paused: { x: 375, y: 150, label: "Paused" },
  cancelled: { x: 90, y: 150, label: "Cancelled" },
  refunding: { x: 560, y: 255, label: "Refunding" },
  refunded: { x: 750, y: 255, label: "Refunded" },
};

export interface DiagramEdge {
  id: string;
  from: VaultStatus;
  to: VaultStatus;
  /** Perpendicular bow so two-way edges between the same pair of nodes don't overlap. */
  bow: number;
}

export const DIAGRAM_EDGES: DiagramEdge[] = (
  Object.entries(VALID_TRANSITIONS) as [VaultStatus, VaultStatus[]][]
).flatMap(([from, tos]) =>
  tos.map((to) => ({
    id: `${from}->${to}`,
    from,
    to,
    bow: from === "paused" && to === "funded" ? -18 : to === "paused" && from === "funded" ? 18 : 0,
  }))
);
