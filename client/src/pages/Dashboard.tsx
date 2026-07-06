import { motion } from "framer-motion";
import { Building2, Clock, Plus, Wallet } from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Layout } from "@/components/layout";
import { api, ApiError } from "@/lib/api";
import { formatDeadline, formatMoney } from "@/lib/format";
import { VAULT_STATUS_LABEL, VAULT_STATUS_VARIANT } from "@/lib/vault-status";
import type { VaultDTO } from "@/types";

export function Dashboard() {
  const [vaults, setVaults] = React.useState<VaultDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);

  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [goalDollars, setGoalDollars] = React.useState("");
  const [merchantName, setMerchantName] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const loadVaults = React.useCallback(() => {
    setLoading(true);
    api<{ vaults: VaultDTO[] }>("/vaults")
      .then((res) => setVaults(res.vaults))
      .catch((err) => setListError(err instanceof ApiError ? err.message : "Failed to load vaults"))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    loadVaults();
  }, [loadVaults]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      await api("/vaults", {
        method: "POST",
        body: JSON.stringify({
          title,
          goalAmountCents: Math.round(Number(goalDollars) * 100),
          merchantName,
          deadline: new Date(deadline).toISOString(),
        }),
      });
      setTitle("");
      setGoalDollars("");
      setMerchantName("");
      setDeadline("");
      setOpen(false);
      loadVaults();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create vault");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Layout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your vaults</h1>
          <p className="mt-1 text-sm text-muted-foreground">Group escrows you lead or have pledged to.</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              New vault
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a vault</DialogTitle>
              <DialogDescription>
                Set the goal, merchant, and deadline. You can start collecting pledges once it's created.
              </DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={handleCreate}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Coachella Airbnb"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="goal">Goal amount (USD)</Label>
                  <Input
                    id="goal"
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="2400"
                    value={goalDollars}
                    onChange={(e) => setGoalDollars(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="merchant">Merchant</Label>
                  <Input
                    id="merchant"
                    placeholder="Airbnb"
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deadline">Funding deadline</Label>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  required
                />
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <Button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create vault"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {listError && <p className="mb-4 text-sm text-destructive">{listError}</p>}

      {loading && <p className="text-sm text-muted-foreground">Loading vaults...</p>}

      {!loading && vaults.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Wallet className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No vaults yet</p>
              <p className="text-sm text-muted-foreground">Create one to start collecting pledges from your squad.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {vaults.map((vault, i) => (
          <motion.div
            key={vault.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.03 }}
          >
            <Link to={`/vaults/${vault.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-tight">{vault.title}</p>
                    <Badge variant={VAULT_STATUS_VARIANT[vault.status]}>{VAULT_STATUS_LABEL[vault.status]}</Badge>
                  </div>
                  <p className="text-lg font-semibold">{formatMoney(vault.goalAmountCents)}</p>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="size-3.5" />
                      {vault.merchantName}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3.5" />
                      {formatDeadline(vault.deadline)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </Layout>
  );
}
