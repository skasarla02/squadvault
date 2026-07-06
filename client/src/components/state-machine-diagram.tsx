import type { VaultStatus } from "@squadvault/shared";
import { motion } from "framer-motion";
import { DIAGRAM_EDGES, DIAGRAM_HEIGHT, DIAGRAM_WIDTH, NODE_HEIGHT, NODE_POSITIONS, NODE_WIDTH } from "@/lib/state-diagram-layout";
import { cn } from "@/lib/utils";

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }, bow: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const halfW = NODE_WIDTH / 2;
  const halfH = NODE_HEIGHT / 2;

  const tFrom = dx === 0 ? halfH / Math.abs(dy || 1) : dy === 0 ? halfW / Math.abs(dx || 1) : Math.min(halfW / Math.abs(dx), halfH / Math.abs(dy));
  const tTo = dx === 0 ? halfH / Math.abs(dy || 1) : dy === 0 ? halfW / Math.abs(dx || 1) : Math.min(halfW / Math.abs(dx), halfH / Math.abs(dy));

  const start = { x: from.x + dx * tFrom, y: from.y + dy * tFrom };
  const end = { x: to.x - dx * tTo, y: to.y - dy * tTo };

  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const len = Math.hypot(dx, dy) || 1;
  const perp = { x: -dy / len, y: dx / len };
  const control = { x: mid.x + perp.x * bow, y: mid.y + perp.y * bow };

  if (bow === 0) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}

interface StateMachineDiagramProps {
  currentStatus: VaultStatus;
  visitedStatuses: Set<VaultStatus>;
  traveledEdges: Set<string>;
  activeEdgeId: string | null;
}

export function StateMachineDiagram({ currentStatus, visitedStatuses, traveledEdges, activeEdgeId }: StateMachineDiagramProps) {
  return (
    <svg viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`} className="h-auto w-full">
      <defs>
        <marker id="arrow-muted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground/40" />
        </marker>
        <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
        </marker>
      </defs>

      {DIAGRAM_EDGES.map((edge) => {
        const from = NODE_POSITIONS[edge.from];
        const to = NODE_POSITIONS[edge.to];
        const isActive = edge.id === activeEdgeId;
        const isTraveled = traveledEdges.has(edge.id);
        return (
          <path
            key={edge.id}
            d={edgePath(from, to, edge.bow)}
            fill="none"
            markerEnd={isTraveled ? "url(#arrow-active)" : "url(#arrow-muted)"}
            className={cn(
              "transition-all duration-500",
              isTraveled ? "stroke-primary" : "stroke-muted-foreground/25",
              isActive && "animate-pulse"
            )}
            strokeWidth={isTraveled ? 2 : 1.25}
          />
        );
      })}

      {Object.entries(NODE_POSITIONS).map(([status, pos]) => {
        const isCurrent = status === currentStatus;
        const isVisited = visitedStatuses.has(status as VaultStatus);
        return (
          <g key={status} transform={`translate(${pos.x - NODE_WIDTH / 2}, ${pos.y - NODE_HEIGHT / 2})`}>
            <motion.rect
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={10}
              animate={{
                scale: isCurrent ? 1.05 : 1,
              }}
              className={cn(
                "origin-center stroke-2 transition-colors duration-500",
                isCurrent
                  ? "fill-primary/20 stroke-primary"
                  : isVisited
                    ? "fill-card stroke-primary/50"
                    : "fill-card stroke-border"
              )}
            />
            <text
              x={NODE_WIDTH / 2}
              y={NODE_HEIGHT / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              className={cn(
                "select-none text-[13px] font-medium transition-colors duration-500",
                isCurrent ? "fill-primary" : isVisited ? "fill-foreground" : "fill-muted-foreground"
              )}
            >
              {pos.label}
            </text>
            {isCurrent && (
              <motion.rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={10}
                className="fill-none stroke-primary"
                initial={{ opacity: 0.6, scale: 1 }}
                animate={{ opacity: 0, scale: 1.35 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
