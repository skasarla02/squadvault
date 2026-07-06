import { AlertTriangle, ArrowLeft, Building2, CalendarClock, CreditCard, FileText, LogOut, ScrollText, Users, Wallet } from "lucide-react";
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { AddMemberDialog } from "@/components/add-member-dialog";
import { AttemptExecutionDialog } from "@/components/attempt-execution-dialog";
import { CheckPriceDialog } from "@/components/check-price-dialog";
import { Layout } from "@/components/layout";
import { PledgeCheckout } from "@/components/pledge-checkout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { PLEDGE_STATUS_VARIANT, VAULT_STATUS_LABEL, VAULT_STATUS_VARIANT } from "@/lib/vault-status";
import type { CardDTO, PledgeDTO, VaultDTO, VaultEventDTO } from "@/types";

export function VaultDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [vault, setVault] = React.useState<VaultDTO | null>(null);
  const [pledges, setPledges] = React.useState<PledgeDTO[]>([]);
  const [events, setEvents] = React.useState<VaultEventDTO[]>([]);
  const [cards, setCards] = React.useState<CardDTO[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [transitioning, setTransitioning] = React.useState(false);
  const [pledgingId, setPledgingId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    if (!id) return;
    api<{ vault: VaultDTO; pledges: PledgeDTO[]; events: VaultEventDTO[]; cards: CardDTO[] }>(`/vaults/${id}`)
      .then((res) => {
        setVault(res.vault);
        setPledges(res.pledges);
        setEvents(res.events);
        setCards(res.cards);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load vault"));
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function startCollecting() {
    if (!id) return;
    setTransitioning(true);
    setError(null);
    try {
      await api(`/vaults/${id}/start-collecting`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start collecting");
    } finally {
      setTransitioning(false);
    }
  }

  async function leaveVault(pledgeId: string) {
    setTransitioning(true);
    setError(null);
    try {
      await api(`/pledges/${pledgeId}/leave`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to leave vault");
    } finally {
      setTransitioning(false);
    }
  }

  async function respondToConsent(pledgeId: string, approve: boolean) {
    setTransitioning(true);
    setError(null);
    try {
      await api(`/pledges/${pledgeId}/consent`, { method: "POST", body: JSON.stringify({ approve }) });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to respond");
    } finally {
      setTransitioning(false);
    }
  }

  const backLink = (
    <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      Back to dashboard
    </Link>
  );

  if (!vault) {
    return (
      <Layout>
        {backLink}
        {error ? (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        )}
      </Layout>
    );
  }

  const isLead = vault.leadId === user?.id;
  const authorizedCents = pledges
    .filter((p) => p.holdStatus === "authorized" || p.holdStatus === "captured")
    .reduce((sum, p) => sum + p.shareAmountCents, 0);
  const fundedPct = Math.min(100, Math.round((authorizedCents / vault.goalAmountCents) * 100));
  const myPledge = pledges.find((p) => p.userId === user?.id);
  const myPendingPledge = myPledge?.holdStatus === "pending" ? myPledge : undefined;
  const myConsentPledge = myPledge?.consentStatus === "pending" ? myPledge : undefined;
  const canLeave =
    myPledge && myPledge.holdStatus !== "voided" && (vault.status === "collecting" || vault.status === "funded");
  const hasProofOfFunds = events.some((e) => e.type === "vault.proof_of_funds_generated");

  return (
    <Layout>
      {backLink}

      <div className="mt-4 mb-2 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{vault.title}</h1>
        <Badge variant={VAULT_STATUS_VARIANT[vault.status]}>{VAULT_STATUS_LABEL[vault.status]}</Badge>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
        <span className="text-base font-semibold text-foreground">{formatMoney(vault.goalAmountCents)}</span>
        <span className="flex items-center gap-1.5">
          <Building2 className="size-3.5" />
          {vault.merchantName}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarClock className="size-3.5" />
          {new Date(vault.deadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>

      {(vault.status === "collecting" || vault.status === "funded") && (
        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{formatMoney(authorizedCents)} authorized</span>
            <span className="font-medium">{fundedPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${fundedPct}%` }} />
          </div>
        </div>
      )}

      {vault.status === "paused" && (
        <Card className="mb-6 border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="flex gap-3 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-yellow-400" />
            <div className="text-sm">
              {vault.pauseReason === "price_jump" ? (
                <>
                  <p className="font-medium">Price changed — top-up needed</p>
                  <p className="text-muted-foreground">
                    The merchant price rose to {formatMoney(vault.pendingGoalAmountCents ?? 0)}, above the buffer.
                    Everyone's share has been rescaled below — approve to re-authorize your new hold, or reject to
                    refund the whole vault.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">A member left — reshare needed</p>
                  <p className="text-muted-foreground">
                    Shares have been redistributed among the remaining members below. Approve to re-authorize your
                    new hold, or reject to refund the whole vault.
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {(vault.status === "refunding" || vault.status === "refunded") && (
        <Card className="mb-6 border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            All holds have been voided and the vault {vault.status === "refunded" ? "has been" : "is being"} refunded.
          </CardContent>
        </Card>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {isLead && vault.status === "draft" && (
          <Button disabled={transitioning} onClick={startCollecting}>
            {transitioning ? "Starting..." : "Start collecting pledges"}
          </Button>
        )}
        {isLead && (vault.status === "draft" || vault.status === "collecting") && (
          <AddMemberDialog vaultId={vault.id} onAdded={load} />
        )}
        {myPendingPledge && vault.status === "collecting" && (
          <Button onClick={() => setPledgingId(myPendingPledge.id)}>
            <Wallet className="size-4" />
            Pledge {formatMoney(myPendingPledge.shareAmountCents)}
          </Button>
        )}
        {isLead && vault.status === "funded" && (
          <>
            <CheckPriceDialog vault={vault} onChecked={load} />
            <AttemptExecutionDialog vaultId={vault.id} onDone={load} />
          </>
        )}
        {myConsentPledge && vault.status === "paused" && (
          <>
            <Button disabled={transitioning} onClick={() => respondToConsent(myConsentPledge.id, true)}>
              Approve new share ({formatMoney(myConsentPledge.shareAmountCents)})
            </Button>
            <Button variant="outline" disabled={transitioning} onClick={() => respondToConsent(myConsentPledge.id, false)}>
              Reject &amp; refund everyone
            </Button>
          </>
        )}
        {canLeave && (vault.status === "collecting" || vault.status === "funded") && (
          <Button variant="outline" disabled={transitioning} onClick={() => myPledge && leaveVault(myPledge.id)}>
            <LogOut className="size-4" />
            Leave vault
          </Button>
        )}
        {hasProofOfFunds && (
          <a href={`/api/vaults/${vault.id}/proof-of-funds.pdf`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <FileText className="size-4" />
              View Proof-of-Funds certificate
            </Button>
          </a>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {cards.map((c) => (
        <Card key={c.id} className="mb-6">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <CreditCard className="size-6 text-primary" />
              <div>
                <p className="font-medium">
                  {c.brand ?? "Card"} •••• {c.last4 ?? "----"}
                  {c.expMonth && c.expYear && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {String(c.expMonth).padStart(2, "0")}/{String(c.expYear).slice(-2)}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Locked to {c.mccLocks.join(", ") || "this merchant"}
                  {c.isMocked && " · mocked (Issuing not activated on this Stripe account)"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-muted-foreground" />
              Pledges
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {pledges.length === 0 && <p className="text-sm text-muted-foreground">No members added yet.</p>}
            {pledges.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{p.userName}</p>
                  <p className="text-xs text-muted-foreground">{formatMoney(p.shareAmountCents)}</p>
                </div>
                <Badge variant={PLEDGE_STATUS_VARIANT[p.holdStatus] ?? "neutral"}>{p.holdStatus}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="size-4 text-muted-foreground" />
              Audit log
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {events.map((e) => (
              <div key={e.id} className="flex items-baseline gap-2 text-sm">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {new Date(e.createdAt).toLocaleTimeString(undefined, { timeStyle: "short" })}
                </span>
                <span className="h-1 w-1 shrink-0 rounded-full bg-primary" />
                <span>{e.type}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={pledgingId !== null} onOpenChange={(open) => !open && setPledgingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authorize your pledge</DialogTitle>
            <DialogDescription>This places a hold — funds are only captured once the vault is funded.</DialogDescription>
          </DialogHeader>
          {pledgingId && (
            <PledgeCheckout
              pledgeId={pledgingId}
              onDone={() => {
                setPledgingId(null);
                load();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
