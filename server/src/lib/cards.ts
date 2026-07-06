import { cards } from "@squadvault/shared";
import { db } from "../db.js";
import { isStripeConfigured, stripe } from "./stripe.js";

interface IssueCardParams {
  vaultId: string;
  leadName: string;
  leadEmail: string;
  merchantName: string;
  limitCents: number;
  /** IP of the request accepting Issuing's cardholder agreement — Stripe requires this to activate a card. */
  acceptanceIp: string;
}

/**
 * Issues a virtual card for the vault's execution step. Tries a real Stripe Issuing
 * test-mode card first (spending-limited to the vault's goal amount and activated so it can
 * actually authorize). Falls back to a mocked card row if Issuing isn't enabled on this
 * account or the call errors for any other reason — see README for why that fallback exists.
 */
export async function issueCard({ vaultId, leadName, leadEmail, merchantName, limitCents, acceptanceIp }: IssueCardParams) {
  if (isStripeConfigured) {
    try {
      const [firstName, ...rest] = leadName.trim().split(/\s+/);
      const lastName = rest.join(" ") || firstName;

      const cardholder = await stripe.issuing.cardholders.create({
        name: leadName.slice(0, 24) || "SquadVault Lead",
        email: leadEmail,
        type: "individual",
        individual: {
          first_name: firstName || "SquadVault",
          last_name: lastName,
          card_issuing: {
            user_terms_acceptance: {
              ip: acceptanceIp,
              date: Math.floor(Date.now() / 1000),
            },
          },
        },
        billing: {
          address: {
            line1: "123 Market St",
            city: "San Francisco",
            state: "CA",
            postal_code: "94103",
            country: "US",
          },
        },
      });

      const card = await stripe.issuing.cards.create({
        cardholder: cardholder.id,
        currency: "usd",
        type: "virtual",
        spending_controls: {
          spending_limits: [{ amount: limitCents, interval: "per_authorization" }],
        },
      });

      await stripe.issuing.cards.update(card.id, { status: "active" });

      const [row] = await db
        .insert(cards)
        .values({
          vaultId,
          stripeIssuingCardId: card.id,
          stripeCardholderId: cardholder.id,
          isMocked: false,
          mccLocks: [merchantName],
          last4: card.last4,
          brand: card.brand,
          expMonth: card.exp_month,
          expYear: card.exp_year,
        })
        .returning();

      return row;
    } catch (err) {
      console.warn("Stripe Issuing card creation failed, falling back to a mocked card:", (err as Error).message);
    }
  }

  const [row] = await db
    .insert(cards)
    .values({
      vaultId,
      isMocked: true,
      mccLocks: [merchantName],
      last4: String(Math.floor(1000 + Math.random() * 9000)),
      brand: "Visa",
      expMonth: 12,
      expYear: new Date().getFullYear() + 3,
    })
    .returning();

  return row;
}

interface CardRow {
  stripeIssuingCardId: string | null;
  isMocked: boolean;
}

/**
 * Simulates the merchant charge attempt against a real issued card via Stripe's test
 * helpers, so a "decline" in the demo is a genuine Stripe-verified decline (e.g. the
 * authorization amount is deliberately pushed over the card's spending limit) rather than a
 * fabricated string. Returns null for mocked cards, letting the caller fall back to the
 * lead's chosen outcome flag directly.
 */
export async function simulateAuthorization(
  card: CardRow,
  amountCents: number,
  merchantName: string,
  forceDecline: boolean
) {
  if (card.isMocked || !card.stripeIssuingCardId) return null;

  const requestedAmount = forceDecline ? amountCents + 100_000 : amountCents;
  return stripe.testHelpers.issuing.authorizations.create({
    card: card.stripeIssuingCardId,
    amount: requestedAmount,
    currency: "usd",
    merchant_data: { category: "eating_places_restaurants", name: merchantName },
  });
}
