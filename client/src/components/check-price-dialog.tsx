import { TrendingUp } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import type { VaultDTO } from "@/types";

export function CheckPriceDialog({ vault, onChecked }: { vault: VaultDTO; onChecked: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [newTotal, setNewTotal] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await api<{ withinBuffer: boolean }>(`/vaults/${vault.id}/check-price`, {
        method: "POST",
        body: JSON.stringify({ newTotalCents: Math.round(Number(newTotal) * 100) }),
      });
      if (res.withinBuffer) {
        setResult("Price is within the buffer — no top-up needed.");
      } else {
        setOpen(false);
      }
      onChecked();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to check price");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <TrendingUp className="size-4" />
          Check price
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Simulate a merchant price check</DialogTitle>
          <DialogDescription>
            This simulates polling the merchant right before execution — the real-world step this models is a price
            quote that may have moved since the vault was funded. Goal is currently{" "}
            <strong>${(vault.goalAmountCents / 100).toFixed(2)}</strong> with a {vault.bufferPct}% buffer.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-total">New total price (USD)</Label>
            <Input
              id="new-total"
              type="number"
              min="1"
              step="0.01"
              value={newTotal}
              onChange={(e) => setNewTotal(e.target.value)}
              required
            />
          </div>
          {result && <p className="text-sm text-primary">{result}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Checking..." : "Check price"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
