import type { VaultStatus } from "@squadvault/shared";
import { AnimatePresence, motion } from "framer-motion";
import {
  CreditCard,
  FileText,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Shuffle,
  Sparkles,
  SkipBack,
  SkipForward,
  TrendingUp,
  UserMinus,
  Users,
} from "lucide-react";
import * as React from "react";
import { Layout } from "@/components/layout";
import { FundingGauge } from "@/components/funding-gauge";
import { StateMachineDiagram } from "@/components/state-machine-diagram";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { SCENARIOS } from "@/lib/simulator-scenarios";
import { cn } from "@/lib/utils";
import { PLEDGE_STATUS_VARIANT, VAULT_STATUS_LABEL, VAULT_STATUS_VARIANT } from "@/lib/vault-status";

const STEP_DURATION_MS = 2200;

const SCENARIO_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "happy-path": Sparkles,
  "price-jump": TrendingUp,
  dropout: UserMinus,
  "merchant-rejection": Shuffle,
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
      <span className="h-px w-4 bg-border" />
      {children}
    </div>
  );
}

export function Simulator() {
  const [scenarioIndex, setScenarioIndex] = React.useState(0);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);

  const scenario = SCENARIOS[scenarioIndex];
  const step = scenario.steps[stepIndex];
  const isLastStep = stepIndex === scenario.steps.length - 1;

  React.useEffect(() => {
    if (!playing || isLastStep) {
      if (isLastStep) setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStepIndex((i) => Math.min(i + 1, scenario.steps.length - 1)), STEP_DURATION_MS / speed);
    return () => clearTimeout(timer);
  }, [playing, stepIndex, speed, scenario, isLastStep]);

  function selectScenario(i: number) {
    setScenarioIndex(i);
    setStepIndex(0);
    setPlaying(false);
  }

  function reset() {
    setStepIndex(0);
    setPlaying(false);
  }

  const { visitedStatuses, traveledEdges, activeEdgeId } = React.useMemo(() => {
    const visited = new Set<VaultStatus>();
    const edges = new Set<string>();
    let activeEdge: string | null = null;
    let prev: VaultStatus | null = null;
    for (let i = 0; i <= stepIndex; i++) {
      const s = scenario.steps[i].status;
      visited.add(s);
      if (prev && prev !== s) {
        const id = `${prev}->${s}`;
        edges.add(id);
        if (i === stepIndex) activeEdge = id;
      }
      prev = s;
    }
    return { visitedStatuses: visited, traveledEdges: edges, activeEdgeId: activeEdge };
  }, [scenario, stepIndex]);

  const eventsSoFar = scenario.steps.slice(0, stepIndex + 1);
  const authorizedCents = step.pledges
    .filter((pl) => pl.holdStatus === "authorized" || pl.holdStatus === "captured")
    .reduce((sum, pl) => sum + pl.shareAmountCents, 0);
  const fundedPct = step.goalAmountCents ? Math.min(100, Math.round((authorizedCents / step.goalAmountCents) * 100)) : 0;
  const ghostCard = "border-white/10 bg-white/[0.02] backdrop-blur-sm";

  return (
    <Layout wide>
      {/* Hero */}
      <div className="bg-aurora relative mb-10 overflow-hidden rounded-2xl border border-white/10 px-6 py-14 text-center sm:px-14">
        <div className="bg-dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_65%_55%_at_50%_0%,black,transparent)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-primary" />
            Public demo · no login required
          </span>
          <h1 className="font-serif mt-6 text-5xl italic tracking-tight text-foreground sm:text-6xl">
            Watch the state machine <span className="text-primary">think</span>.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
            Four scripted scenarios replay the exact transitions and event types the real SquadVault server enforces —
            not an animation of what it might do, but the same rules it actually runs on.
          </p>
        </div>
      </div>

      <Eyebrow>Scenario</Eyebrow>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SCENARIOS.map((s, i) => {
          const Icon = SCENARIO_ICONS[s.id] ?? Sparkles;
          const selected = i === scenarioIndex;
          return (
            <button
              key={s.id}
              onClick={() => selectScenario(i)}
              className={cn(
                "rounded-xl border p-5 text-left transition-all duration-200",
                selected ? "border-primary/50 bg-primary/[0.08]" : "border-white/10 bg-white/[0.02] hover:border-white/25"
              )}
            >
              <Icon className={cn("size-5", selected ? "text-primary" : "text-muted-foreground")} />
              <p className="mt-3 font-medium">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.tagline}</p>
            </button>
          );
        })}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playing ? "Pause" : "Play"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          disabled={stepIndex === 0}
        >
          <SkipBack className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setStepIndex((i) => Math.min(scenario.steps.length - 1, i + 1))}
          disabled={isLastStep}
        >
          <SkipForward className="size-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          <RotateCcw className="size-4" />
          Reset
        </Button>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Step {stepIndex + 1} / {scenario.steps.length}
          </span>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="rounded border border-border bg-transparent px-2 py-1 text-foreground"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
          </select>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Card className={ghostCard}>
            <CardContent className="p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-serif text-2xl italic">{scenario.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {step.timeLabel} · {scenario.merchantName}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <Badge variant={VAULT_STATUS_VARIANT[step.status]}>{VAULT_STATUS_LABEL[step.status]}</Badge>
                  {(step.status === "collecting" || step.status === "funded") && (
                    <FundingGauge percent={fundedPct} size={72} />
                  )}
                </div>
              </div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={stepIndex}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="text-sm leading-relaxed"
                >
                  {step.narration}
                </motion.p>
              </AnimatePresence>
              <p className="mt-3 font-mono text-xs text-muted-foreground">{step.technical}</p>
              {(step.status === "collecting" || step.status === "funded") && (
                <p className="mt-3 text-xs text-muted-foreground">{formatMoney(authorizedCents)} authorized of {formatMoney(step.goalAmountCents)}</p>
              )}
            </CardContent>
          </Card>

          {step.card && (
            <Card className={ghostCard}>
              <CardContent className="flex items-center gap-3 p-4">
                <CreditCard className="size-6 text-primary" />
                <div>
                  <p className="font-medium">
                    {step.card.brand} •••• {step.card.last4}
                  </p>
                  <p className="text-xs text-muted-foreground">Locked to {step.card.mccLock}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {step.showProofOfFunds && (
            <Card className={cn(ghostCard, "border-primary/30 bg-primary/5")}>
              <CardContent className="flex items-center gap-3 p-4">
                <FileText className="size-5 shrink-0 text-primary" />
                <p className="text-sm">
                  Proof-of-Funds certificate generated — a real PDF in the live app (see Milestone 4), proving the
                  group's money is there even though the merchant declined.
                </p>
              </CardContent>
            </Card>
          )}

          <Card className={ghostCard}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                <Users className="size-3.5" />
                Members
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 pt-0">
              {step.pledges.length === 0 && <p className="text-sm text-muted-foreground">No members yet.</p>}
              {step.pledges.map((pl) => (
                <div key={pl.name} className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.015] px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{pl.name}</p>
                    <p className="text-xs text-muted-foreground">{formatMoney(pl.shareAmountCents)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {pl.consentStatus !== "not_required" && (
                      <Badge variant={pl.consentStatus === "pending" ? "warning" : "primary"}>{pl.consentStatus}</Badge>
                    )}
                    <Badge variant={PLEDGE_STATUS_VARIANT[pl.holdStatus] ?? "neutral"}>{pl.holdStatus}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className={cn(ghostCard, "h-full")}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                <ScrollText className="size-3.5" />
                Event log
              </CardTitle>
            </CardHeader>
            <CardContent className="flex max-h-[560px] flex-col gap-2.5 overflow-y-auto pt-0">
              <AnimatePresence initial={false}>
                {eventsSoFar.map((e, i) => (
                  <motion.div
                    key={`${scenario.id}-${i}`}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-baseline gap-2 text-sm"
                  >
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{e.timeLabel}</span>
                    <span className="h-1 w-1 shrink-0 rounded-full bg-primary" />
                    <span>{e.eventType}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className={cn(ghostCard, "bg-dot-grid")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            The state machine
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-normal normal-case text-muted-foreground">
              shared/src/state-machine.ts
            </code>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StateMachineDiagram
            currentStatus={step.status}
            visitedStatuses={visitedStatuses}
            traveledEdges={traveledEdges}
            activeEdgeId={activeEdgeId}
          />
        </CardContent>
      </Card>
    </Layout>
  );
}
