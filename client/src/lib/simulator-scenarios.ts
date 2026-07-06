import type { VaultEventType, VaultStatus } from "@squadvault/shared";
import { assertTransition } from "@squadvault/shared";

export interface SimPledge {
  name: string;
  shareAmountCents: number;
  holdStatus: "pending" | "authorized" | "voided" | "captured";
  consentStatus: "not_required" | "pending" | "approved";
}

export interface SimCard {
  brand: string;
  last4: string;
  mccLock: string;
}

export interface SimStep {
  status: VaultStatus;
  pauseReason?: "price_jump" | "dropout" | null;
  goalAmountCents: number;
  pendingGoalAmountCents?: number | null;
  eventType: VaultEventType;
  technical: string;
  narration: string;
  timeLabel: string;
  pledges: SimPledge[];
  card?: SimCard | null;
  showProofOfFunds?: boolean;
}

export interface Scenario {
  id: string;
  title: string;
  tagline: string;
  merchantName: string;
  steps: SimStep[];
}

const p = (name: string, shareAmountCents: number, holdStatus: SimPledge["holdStatus"], consentStatus: SimPledge["consentStatus"] = "not_required"): SimPledge => ({
  name,
  shareAmountCents,
  holdStatus,
  consentStatus,
});

const happyPath: Scenario = {
  id: "happy-path",
  title: "Happy Path",
  tagline: "Three friends split an Airbnb and nothing goes wrong.",
  merchantName: "Airbnb",
  steps: [
    {
      status: "draft",
      goalAmountCents: 240000,
      eventType: "vault.created",
      technical: "vault.created",
      narration: "Sid sets up the vault: $2,400 total, Airbnb as the merchant, a 3-day deadline, and a 5% buffer in case the price moves.",
      timeLabel: "Day 1 · 9:00 AM",
      pledges: [],
    },
    {
      status: "draft",
      goalAmountCents: 240000,
      eventType: "pledge.added",
      technical: "pledge.added · Sid",
      narration: "Sid pledges his own $800 share first.",
      timeLabel: "Day 1 · 9:01 AM",
      pledges: [p("Sid", 80000, "pending")],
    },
    {
      status: "draft",
      goalAmountCents: 240000,
      eventType: "pledge.added",
      technical: "pledge.added · Jordan",
      narration: "Jordan gets added for $800 too.",
      timeLabel: "Day 1 · 9:02 AM",
      pledges: [p("Sid", 80000, "pending"), p("Jordan", 80000, "pending")],
    },
    {
      status: "draft",
      goalAmountCents: 240000,
      eventType: "pledge.added",
      technical: "pledge.added · Maya",
      narration: "Maya joins with the last $800 share.",
      timeLabel: "Day 1 · 9:03 AM",
      pledges: [p("Sid", 80000, "pending"), p("Jordan", 80000, "pending"), p("Maya", 80000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 240000,
      eventType: "vault.collecting_started",
      technical: "vault.collecting_started",
      narration: "Now that everyone's in, collecting opens. Nobody's actually paid anything yet — each person still needs to approve their own charge.",
      timeLabel: "Day 1 · 9:05 AM",
      pledges: [p("Sid", 80000, "pending"), p("Jordan", 80000, "pending"), p("Maya", 80000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 240000,
      eventType: "pledge.authorized",
      technical: "pledge.authorized · Sid · Stripe PaymentIntent → requires_capture",
      narration: "Sid approves his $800. It's a hold, not a charge — his card isn't billed yet.",
      timeLabel: "Day 1 · 9:06 AM",
      pledges: [p("Sid", 80000, "authorized"), p("Jordan", 80000, "pending"), p("Maya", 80000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 240000,
      eventType: "pledge.authorized",
      technical: "pledge.authorized · Jordan",
      narration: "Jordan approves his from his phone a few hours later.",
      timeLabel: "Day 1 · 2:14 PM",
      pledges: [p("Sid", 80000, "authorized"), p("Jordan", 80000, "authorized"), p("Maya", 80000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 240000,
      eventType: "pledge.authorized",
      technical: "pledge.authorized · Maya",
      narration: "Maya approves the next morning. All three shares are held now.",
      timeLabel: "Day 2 · 8:40 AM",
      pledges: [p("Sid", 80000, "authorized"), p("Jordan", 80000, "authorized"), p("Maya", 80000, "authorized")],
    },
    {
      status: "funded",
      goalAmountCents: 240000,
      eventType: "vault.funded",
      technical: "vault.funded · totalCents: 240000",
      narration: "Everyone's approved before the deadline, so the vault moves to funded on its own. That's the whole idea — nobody was on the hook until everyone else was too.",
      timeLabel: "Day 2 · 8:40 AM",
      pledges: [p("Sid", 80000, "authorized"), p("Jordan", 80000, "authorized"), p("Maya", 80000, "authorized")],
    },
    {
      status: "executing",
      goalAmountCents: 240000,
      eventType: "vault.executing_started",
      technical: "vault.executing_started",
      narration: "Sid goes to actually book it. A one-time virtual card gets issued just for this purchase.",
      timeLabel: "Day 2 · 8:42 AM",
      pledges: [p("Sid", 80000, "authorized"), p("Jordan", 80000, "authorized"), p("Maya", 80000, "authorized")],
    },
    {
      status: "executing",
      goalAmountCents: 240000,
      eventType: "card.issued",
      technical: "card.issued · Stripe Issuing (test mode)",
      narration: "The card only works at Airbnb — it's locked to that one merchant, so it's useless anywhere else.",
      timeLabel: "Day 2 · 8:42 AM",
      pledges: [p("Sid", 80000, "authorized"), p("Jordan", 80000, "authorized"), p("Maya", 80000, "authorized")],
      card: { brand: "Visa", last4: "4242", mccLock: "Airbnb" },
    },
    {
      status: "completed",
      goalAmountCents: 240000,
      eventType: "vault.completed",
      technical: "vault.completed",
      narration: "Booking goes through, and all three holds turn into real charges for exactly what each person agreed to. Took under 24 hours, and nobody had to ask anyone twice.",
      timeLabel: "Day 2 · 8:43 AM",
      pledges: [p("Sid", 80000, "captured"), p("Jordan", 80000, "captured"), p("Maya", 80000, "captured")],
      card: { brand: "Visa", last4: "4242", mccLock: "Airbnb" },
    },
  ],
};

const priceJump: Scenario = {
  id: "price-jump",
  title: "Price Jump",
  tagline: "The price goes up before the group actually pays for anything.",
  merchantName: "VillaStays",
  steps: [
    {
      status: "draft",
      goalAmountCents: 300000,
      eventType: "vault.created",
      technical: "vault.created",
      narration: "A $3,000 villa in Cabo, split between two people, with the standard 5% buffer.",
      timeLabel: "Day 1 · 10:00 AM",
      pledges: [],
    },
    {
      status: "draft",
      goalAmountCents: 300000,
      eventType: "pledge.added",
      technical: "pledge.added · Sid",
      narration: "Sid pledges his $1,500 half.",
      timeLabel: "Day 1 · 10:01 AM",
      pledges: [p("Sid", 150000, "pending")],
    },
    {
      status: "draft",
      goalAmountCents: 300000,
      eventType: "pledge.added",
      technical: "pledge.added · Alex",
      narration: "Alex matches it with the other $1,500.",
      timeLabel: "Day 1 · 10:02 AM",
      pledges: [p("Sid", 150000, "pending"), p("Alex", 150000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 300000,
      eventType: "vault.collecting_started",
      technical: "vault.collecting_started",
      narration: "Collecting opens for both shares.",
      timeLabel: "Day 1 · 10:05 AM",
      pledges: [p("Sid", 150000, "pending"), p("Alex", 150000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 300000,
      eventType: "pledge.authorized",
      technical: "pledge.authorized · Sid",
      narration: "Sid approves his $1,500 hold.",
      timeLabel: "Day 1 · 10:10 AM",
      pledges: [p("Sid", 150000, "authorized"), p("Alex", 150000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 300000,
      eventType: "pledge.authorized",
      technical: "pledge.authorized · Alex",
      narration: "Alex approves his half too.",
      timeLabel: "Day 1 · 4:30 PM",
      pledges: [p("Sid", 150000, "authorized"), p("Alex", 150000, "authorized")],
    },
    {
      status: "funded",
      goalAmountCents: 300000,
      eventType: "vault.funded",
      technical: "vault.funded",
      narration: "Fully funded at $3,000. But the villa operator can still change their quote before the booking actually happens.",
      timeLabel: "Day 1 · 4:30 PM",
      pledges: [p("Sid", 150000, "authorized"), p("Alex", 150000, "authorized")],
    },
    {
      status: "paused",
      pauseReason: "price_jump",
      goalAmountCents: 300000,
      pendingGoalAmountCents: 360000,
      eventType: "vault.paused_price_jump",
      technical: "vault.paused_price_jump · ceiling: $3,150 · new: $3,600",
      narration: "The quote jumps to $3,600 — 20% higher, past the 5% buffer of $3,150. Instead of just charging everyone more without asking, the vault pauses.",
      timeLabel: "Day 2 · 11:00 AM",
      pledges: [p("Sid", 180000, "pending", "pending"), p("Alex", 180000, "pending", "pending")],
    },
    {
      status: "paused",
      pauseReason: "price_jump",
      goalAmountCents: 300000,
      pendingGoalAmountCents: 360000,
      eventType: "pledge.topup_approved",
      technical: "pledge.topup_approved · Sid · $1,800",
      narration: "Sid looks at the new $1,800 share and approves it.",
      timeLabel: "Day 2 · 11:05 AM",
      pledges: [p("Sid", 180000, "pending", "approved"), p("Alex", 180000, "pending", "pending")],
    },
    {
      status: "paused",
      pauseReason: "price_jump",
      goalAmountCents: 300000,
      pendingGoalAmountCents: 360000,
      eventType: "pledge.topup_approved",
      technical: "pledge.topup_approved · Alex · $1,800",
      narration: "Alex approves too. Both had to agree before anything moves forward.",
      timeLabel: "Day 2 · 1:20 PM",
      pledges: [p("Sid", 180000, "pending", "approved"), p("Alex", 180000, "pending", "approved")],
    },
    {
      status: "collecting",
      goalAmountCents: 360000,
      pendingGoalAmountCents: null,
      eventType: "vault.resumed_after_topup",
      technical: "vault.resumed_after_topup · newGoalAmountCents: 360000",
      narration: "With both approvals in, the goal updates to $3,600 and collecting reopens. The old holds got cancelled — everyone needs to approve a fresh one at the new price.",
      timeLabel: "Day 2 · 1:21 PM",
      pledges: [p("Sid", 180000, "pending"), p("Alex", 180000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 360000,
      eventType: "pledge.authorized",
      technical: "pledge.authorized · Sid · re-authorized",
      narration: "Sid approves the new $1,800 hold.",
      timeLabel: "Day 2 · 1:25 PM",
      pledges: [p("Sid", 180000, "authorized"), p("Alex", 180000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 360000,
      eventType: "pledge.authorized",
      technical: "pledge.authorized · Alex · re-authorized",
      narration: "Alex does the same.",
      timeLabel: "Day 2 · 2:00 PM",
      pledges: [p("Sid", 180000, "authorized"), p("Alex", 180000, "authorized")],
    },
    {
      status: "funded",
      goalAmountCents: 360000,
      eventType: "vault.funded",
      technical: "vault.funded · totalCents: 360000",
      narration: "Funded again, this time at the real price.",
      timeLabel: "Day 2 · 2:00 PM",
      pledges: [p("Sid", 180000, "authorized"), p("Alex", 180000, "authorized")],
    },
    {
      status: "executing",
      goalAmountCents: 360000,
      eventType: "vault.executing_started",
      technical: "vault.executing_started",
      narration: "The booking goes through at $3,600.",
      timeLabel: "Day 2 · 2:02 PM",
      pledges: [p("Sid", 180000, "authorized"), p("Alex", 180000, "authorized")],
    },
    {
      status: "completed",
      goalAmountCents: 360000,
      eventType: "vault.completed",
      technical: "vault.completed",
      narration: "Done. The price moved, but nobody got stuck covering the difference without knowing about it first.",
      timeLabel: "Day 2 · 2:03 PM",
      pledges: [p("Sid", 180000, "captured"), p("Alex", 180000, "captured")],
      card: { brand: "Visa", last4: "5588", mccLock: "VillaStays" },
    },
  ],
};

const dropout: Scenario = {
  id: "dropout",
  title: "Last-Minute Dropout",
  tagline: "Someone backs out before paying their share.",
  merchantName: "Tahoe Cabin Co.",
  steps: [
    {
      status: "draft",
      goalAmountCents: 120000,
      eventType: "vault.created",
      technical: "vault.created",
      narration: "A $1,200 cabin in Tahoe, split three ways.",
      timeLabel: "Day 1 · 6:00 PM",
      pledges: [],
    },
    {
      status: "draft",
      goalAmountCents: 120000,
      eventType: "pledge.added",
      technical: "pledge.added · Sid",
      narration: "Sid, Priya, and Omar each go in for $400.",
      timeLabel: "Day 1 · 6:01 PM",
      pledges: [p("Sid", 40000, "pending")],
    },
    {
      status: "draft",
      goalAmountCents: 120000,
      eventType: "pledge.added",
      technical: "pledge.added · Priya",
      narration: "Priya joins in.",
      timeLabel: "Day 1 · 6:02 PM",
      pledges: [p("Sid", 40000, "pending"), p("Priya", 40000, "pending")],
    },
    {
      status: "draft",
      goalAmountCents: 120000,
      eventType: "pledge.added",
      technical: "pledge.added · Omar",
      narration: "Omar rounds out the group.",
      timeLabel: "Day 1 · 6:03 PM",
      pledges: [p("Sid", 40000, "pending"), p("Priya", 40000, "pending"), p("Omar", 40000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 120000,
      eventType: "vault.collecting_started",
      technical: "vault.collecting_started",
      narration: "Collecting opens.",
      timeLabel: "Day 1 · 6:05 PM",
      pledges: [p("Sid", 40000, "pending"), p("Priya", 40000, "pending"), p("Omar", 40000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 120000,
      eventType: "pledge.authorized",
      technical: "pledge.authorized · Sid",
      narration: "Sid approves his $400 right away.",
      timeLabel: "Day 1 · 6:10 PM",
      pledges: [p("Sid", 40000, "authorized"), p("Priya", 40000, "pending"), p("Omar", 40000, "pending")],
    },
    {
      status: "paused",
      pauseReason: "dropout",
      goalAmountCents: 120000,
      eventType: "pledge.dropout",
      technical: "pledge.dropout · Omar · $400 voided",
      narration: "Omar has to drop out — a family thing came up. He hadn't approved his hold yet, so it just gets cancelled.",
      timeLabel: "Day 2 · 9:00 AM",
      pledges: [p("Sid", 60000, "pending", "pending"), p("Priya", 60000, "pending", "pending")],
    },
    {
      status: "paused",
      pauseReason: "dropout",
      goalAmountCents: 120000,
      eventType: "vault.reshare_required",
      technical: "vault.reshare_required · +$200 each",
      narration: "His $400 splits evenly between whoever's left — $200 more each for Sid and Priya. The trip doesn't fall apart, the math just changes. Both need to agree to the new amount first.",
      timeLabel: "Day 2 · 9:00 AM",
      pledges: [p("Sid", 60000, "pending", "pending"), p("Priya", 60000, "pending", "pending")],
    },
    {
      status: "paused",
      pauseReason: "dropout",
      goalAmountCents: 120000,
      eventType: "pledge.reshare_approved",
      technical: "pledge.reshare_approved · Sid · $600",
      narration: "Sid's fine paying the extra $200 to keep the cabin booked.",
      timeLabel: "Day 2 · 9:05 AM",
      pledges: [p("Sid", 60000, "pending", "approved"), p("Priya", 60000, "pending", "pending")],
    },
    {
      status: "paused",
      pauseReason: "dropout",
      goalAmountCents: 120000,
      eventType: "pledge.reshare_approved",
      technical: "pledge.reshare_approved · Priya · $600",
      narration: "Priya agrees too. Both have signed off, so things can move forward.",
      timeLabel: "Day 2 · 11:30 AM",
      pledges: [p("Sid", 60000, "pending", "approved"), p("Priya", 60000, "pending", "approved")],
    },
    {
      status: "collecting",
      goalAmountCents: 120000,
      eventType: "vault.resumed_after_reshare",
      technical: "vault.resumed_after_reshare",
      narration: "Collecting reopens at $600 each. Sid's earlier approval doesn't carry over — both need to approve again at the new price.",
      timeLabel: "Day 2 · 11:31 AM",
      pledges: [p("Sid", 60000, "pending"), p("Priya", 60000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 120000,
      eventType: "pledge.authorized",
      technical: "pledge.authorized · Sid · re-authorized",
      narration: "Sid approves the new $600.",
      timeLabel: "Day 2 · 11:35 AM",
      pledges: [p("Sid", 60000, "authorized"), p("Priya", 60000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 120000,
      eventType: "pledge.authorized",
      technical: "pledge.authorized · Priya · re-authorized",
      narration: "Priya approves hers too. Fully covered again, just with two people instead of three.",
      timeLabel: "Day 2 · 12:00 PM",
      pledges: [p("Sid", 60000, "authorized"), p("Priya", 60000, "authorized")],
    },
    {
      status: "funded",
      goalAmountCents: 120000,
      eventType: "vault.funded",
      technical: "vault.funded",
      narration: "Funded.",
      timeLabel: "Day 2 · 12:00 PM",
      pledges: [p("Sid", 60000, "authorized"), p("Priya", 60000, "authorized")],
    },
    {
      status: "executing",
      goalAmountCents: 120000,
      eventType: "vault.executing_started",
      technical: "vault.executing_started",
      narration: "Booking goes through for the cabin.",
      timeLabel: "Day 2 · 12:02 PM",
      pledges: [p("Sid", 60000, "authorized"), p("Priya", 60000, "authorized")],
    },
    {
      status: "completed",
      goalAmountCents: 120000,
      eventType: "vault.completed",
      technical: "vault.completed",
      narration: "Cabin's booked, both charges go through. Omar dropping out cost the group a conversation about splitting the difference — not the trip itself.",
      timeLabel: "Day 2 · 12:03 PM",
      pledges: [p("Sid", 60000, "captured"), p("Priya", 60000, "captured")],
      card: { brand: "Visa", last4: "1187", mccLock: "Tahoe Cabin Co." },
    },
  ],
};

const merchantRejection: Scenario = {
  id: "merchant-rejection",
  title: "Merchant Rejection",
  tagline: "The card gets declined right at checkout.",
  merchantName: "Ticketmaster",
  steps: [
    {
      status: "draft",
      goalAmountCents: 90000,
      eventType: "vault.created",
      technical: "vault.created",
      narration: "$900 in Warriors tickets, split three ways.",
      timeLabel: "Day 1 · 5:00 PM",
      pledges: [],
    },
    {
      status: "draft",
      goalAmountCents: 90000,
      eventType: "pledge.added",
      technical: "pledge.added · Sid",
      narration: "Sid, Devon, and Kai each go in for $300.",
      timeLabel: "Day 1 · 5:01 PM",
      pledges: [p("Sid", 30000, "pending")],
    },
    {
      status: "draft",
      goalAmountCents: 90000,
      eventType: "pledge.added",
      technical: "pledge.added · Devon",
      narration: "Devon joins in.",
      timeLabel: "Day 1 · 5:02 PM",
      pledges: [p("Sid", 30000, "pending"), p("Devon", 30000, "pending")],
    },
    {
      status: "draft",
      goalAmountCents: 90000,
      eventType: "pledge.added",
      technical: "pledge.added · Kai",
      narration: "Kai completes the group.",
      timeLabel: "Day 1 · 5:03 PM",
      pledges: [p("Sid", 30000, "pending"), p("Devon", 30000, "pending"), p("Kai", 30000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 90000,
      eventType: "vault.collecting_started",
      technical: "vault.collecting_started",
      narration: "Collecting opens.",
      timeLabel: "Day 1 · 5:05 PM",
      pledges: [p("Sid", 30000, "pending"), p("Devon", 30000, "pending"), p("Kai", 30000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 90000,
      eventType: "pledge.authorized",
      technical: "pledge.authorized · Sid",
      narration: "Sid approves his $300.",
      timeLabel: "Day 1 · 5:10 PM",
      pledges: [p("Sid", 30000, "authorized"), p("Devon", 30000, "pending"), p("Kai", 30000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 90000,
      eventType: "pledge.authorized",
      technical: "pledge.authorized · Devon",
      narration: "Devon approves his.",
      timeLabel: "Day 1 · 5:40 PM",
      pledges: [p("Sid", 30000, "authorized"), p("Devon", 30000, "authorized"), p("Kai", 30000, "pending")],
    },
    {
      status: "collecting",
      goalAmountCents: 90000,
      eventType: "pledge.authorized",
      technical: "pledge.authorized · Kai",
      narration: "Kai approves last. All three shares are held.",
      timeLabel: "Day 1 · 6:15 PM",
      pledges: [p("Sid", 30000, "authorized"), p("Devon", 30000, "authorized"), p("Kai", 30000, "authorized")],
    },
    {
      status: "funded",
      goalAmountCents: 90000,
      eventType: "vault.funded",
      technical: "vault.funded",
      narration: "Fully funded — time to actually buy the tickets.",
      timeLabel: "Day 1 · 6:15 PM",
      pledges: [p("Sid", 30000, "authorized"), p("Devon", 30000, "authorized"), p("Kai", 30000, "authorized")],
    },
    {
      status: "executing",
      goalAmountCents: 90000,
      eventType: "vault.executing_started",
      technical: "vault.executing_started",
      narration: "A virtual card gets issued for the purchase.",
      timeLabel: "Day 1 · 6:16 PM",
      pledges: [p("Sid", 30000, "authorized"), p("Devon", 30000, "authorized"), p("Kai", 30000, "authorized")],
      card: { brand: "Visa", last4: "7791", mccLock: "Ticketmaster" },
    },
    {
      status: "executing",
      goalAmountCents: 90000,
      eventType: "vault.merchant_declined",
      technical: "vault.merchant_declined · errorCode: cardholder_verification_required (real Stripe response)",
      narration: "Ticketmaster's checkout rejects the card. Happens more than you'd expect with a brand-new virtual card. The money's still there, though — sitting in escrow.",
      timeLabel: "Day 1 · 6:17 PM",
      pledges: [p("Sid", 30000, "authorized"), p("Devon", 30000, "authorized"), p("Kai", 30000, "authorized")],
      card: { brand: "Visa", last4: "7791", mccLock: "Ticketmaster" },
    },
    {
      status: "executing",
      goalAmountCents: 90000,
      eventType: "vault.proof_of_funds_generated",
      technical: "vault.proof_of_funds_generated · PDF via pdf-lib",
      narration: "A Proof-of-Funds certificate generates automatically — proof the group already paid, so Sid can put it on his own card without having to explain himself to anyone.",
      timeLabel: "Day 1 · 6:17 PM",
      pledges: [p("Sid", 30000, "authorized"), p("Devon", 30000, "authorized"), p("Kai", 30000, "authorized")],
      card: { brand: "Visa", last4: "7791", mccLock: "Ticketmaster" },
      showProofOfFunds: true,
    },
    {
      status: "executing",
      goalAmountCents: 90000,
      eventType: "vault.reimbursement_released",
      technical: "vault.reimbursement_released · $900 → lead",
      narration: "Sid buys the tickets on his own card. The three holds get charged and the money goes to him as reimbursement — nobody has to be asked to pay him back.",
      timeLabel: "Day 1 · 6:20 PM",
      pledges: [p("Sid", 30000, "captured"), p("Devon", 30000, "captured"), p("Kai", 30000, "captured")],
      card: { brand: "Visa", last4: "7791", mccLock: "Ticketmaster" },
      showProofOfFunds: true,
    },
    {
      status: "completed",
      goalAmountCents: 90000,
      eventType: "vault.completed",
      technical: "vault.completed · viaReimbursement: true",
      narration: "Tickets bought, Sid paid back, all within a few minutes of the decline.",
      timeLabel: "Day 1 · 6:21 PM",
      pledges: [p("Sid", 30000, "captured"), p("Devon", 30000, "captured"), p("Kai", 30000, "captured")],
      card: { brand: "Visa", last4: "7791", mccLock: "Ticketmaster" },
      showProofOfFunds: true,
    },
  ],
};

export const SCENARIOS: Scenario[] = [happyPath, priceJump, dropout, merchantRejection];

/** Dev-time integrity check: every status change a scenario script makes must be a legal transition. */
function validateScenario(scenario: Scenario) {
  let prev: VaultStatus | null = null;
  for (const step of scenario.steps) {
    if (prev !== null && prev !== step.status) {
      assertTransition(prev, step.status);
    }
    prev = step.status;
  }
}

SCENARIOS.forEach(validateScenario);
