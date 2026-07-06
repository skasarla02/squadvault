import { CreditCard } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";

export function AttemptExecutionDialog({ vaultId, onDone }: { vaultId: string; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState<"success" | "declined" | null>(null);

  async function attempt(outcome: "success" | "declined") {
    setError(null);
    setSubmitting(outcome);
    try {
      await api(`/vaults/${vaultId}/attempt-execution`, {
        method: "POST",
        body: JSON.stringify({ outcome }),
      });
      setOpen(false);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to attempt execution");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CreditCard className="size-4" />
          Attempt execution
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue card &amp; attempt the purchase</DialogTitle>
          <DialogDescription>
            A virtual card is mocked here in place of live Stripe Issuing. Pick an outcome to simulate the merchant
            charge attempt.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Button disabled={submitting !== null} onClick={() => attempt("success")}>
            {submitting === "success" ? "Capturing holds..." : "Simulate success"}
          </Button>
          <Button variant="outline" disabled={submitting !== null} onClick={() => attempt("declined")}>
            {submitting === "declined" ? "Processing decline..." : "Simulate merchant decline"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
