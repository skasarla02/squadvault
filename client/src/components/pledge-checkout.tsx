import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { stripePromise } from "@/lib/stripe";

function PledgeForm({ pledgeId, onDone }: { pledgeId: string; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });
      if (stripeError) {
        setError(stripeError.message ?? "The card was declined.");
        return;
      }
      if (paymentIntent?.status !== "requires_capture") {
        setError(`Unexpected hold status: ${paymentIntent?.status}`);
        return;
      }
      await api(`/pledges/${pledgeId}/confirm`, { method: "POST" });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to confirm the pledge");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={!stripe || submitting}>
        {submitting ? "Authorizing hold..." : "Authorize hold"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Test mode — use card 4242 4242 4242 4242, any future expiry, any CVC. Your card won't be charged; this only
        places a hold.
      </p>
    </form>
  );
}

export function PledgeCheckout({ pledgeId, onDone }: { pledgeId: string; onDone: () => void }) {
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api<{ clientSecret: string }>(`/pledges/${pledgeId}/create-intent`, { method: "POST" })
      .then((res) => setClientSecret(res.clientSecret))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to start checkout"));
  }, [pledgeId]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!clientSecret) return <p className="text-sm text-muted-foreground">Loading checkout...</p>;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
      <PledgeForm pledgeId={pledgeId} onDone={onDone} />
    </Elements>
  );
}
