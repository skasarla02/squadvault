# SquadVault

A group-escrow app that eliminates "debt lag" when friends split large shared costs. Instead of one person fronting the money and chasing everyone else for weeks, the group pledges into escrow; nobody's money moves until the group hits 100% funding before a deadline (**all-or-nothing**). Once funded, a virtual card executes the purchase.

**⚠️ Test mode / not a real bank.** This is a working MVP: the core escrow logic, state machine, and Stripe integration are real code, but every dollar involved is [Stripe test-mode](https://stripe.com/docs/testing) money. No real fund custody, KYC, or money transmission happens here — that's regulated banking and explicitly out of scope.

## Status: Milestone 6 of 6

Done: repo scaffold, data model, dev auth, the pledge/funding lifecycle on real Stripe test-mode PaymentIntents, all three edge-case flows (price jump, dropout, merchant rejection) as real state transitions, the execution layer (real Stripe Issuing test-mode virtual cards), the public **Logic Simulator** at `/simulator`, and a deploy-ready build (see Deployment below).

**Live demo:** _TODO — paste the Render URL here once deployed._

## Architecture

- **`client/`** — React 19 + Vite + TypeScript, Tailwind CSS v4, shadcn/ui-style components, framer-motion, `@stripe/react-stripe-js` for the pledge checkout (Stripe Payment Element).
- **`server/`** — Express + TypeScript, session-based dev-login auth, Stripe Node SDK (PaymentIntents + Issuing), `pdf-lib` for the Proof-of-Funds certificate.
- **`shared/`** — Drizzle ORM schema (Postgres/Neon) and the escrow **state machine** (`shared/src/state-machine.ts`), imported by both the server (to enforce legal transitions) and, later, the public simulator (to replay them). Vault lifecycle:

  ```
  draft → collecting → funded → executing → completed
                    ↘ paused ↗        ↘
                       ↘――――――――――――→ refunding → refunded
  ```

  Every transition writes to an append-only `events` table, which powers the audit trail and (eventually) the Logic Simulator.

- Data model: `users`, `vaults`, `pledges`, `events`, `cards` (see `shared/src/schema.ts`).

## How money actually moves (test mode)

1. **Pledging** (`server/src/routes/pledges.ts`) — each member's share becomes a Stripe `PaymentIntent` with `capture_method: manual`. Confirming it (via the Payment Element on the client) authorizes a hold without capturing funds.
2. **All-or-nothing** (`server/src/lib/funding.ts`) — once authorized holds cover the goal amount, the vault flips `collecting → funded` automatically.
3. **Edge cases** (`server/src/routes/vaults.ts`, `pledges.ts`) —
   - **Price jump**: `check-price` compares a (simulated) new merchant total to the buffer ceiling. Over-buffer pauses the vault, rescales every pledge, and requires fresh consent + re-authorization before resuming.
   - **Dropout**: `leave` voids a member's hold, redistributes their share across whoever's left, and pauses for reshare consent.
   - Both pause flows funnel through one shared `consent` endpoint; a reject from anyone triggers `refundAllPledges` (`server/src/lib/refund.ts`), which cancels every outstanding Stripe hold and drives the vault to `refunded`.
4. **Execution** (`server/src/lib/cards.ts`, `attempt-execution`) — issues a **real Stripe Issuing test-mode virtual card** (see below), then either captures the holds (success) or logs a real Stripe-verified decline, generates a Proof-of-Funds PDF, and captures the holds as a reimbursement to the lead instead.

## The virtual card: real Stripe Issuing, not a mock

The brief's fallback plan was to mock card issuance if Issuing "activated cleanly" turned out to be heavy. It didn't turn out that way — worth documenting exactly what happened, since it's a good example of working through a real third-party integration:

1. First attempt hit: `"Your account is not set up to use Issuing. Please visit https://dashboard.stripe.com/issuing/overview to get started."` — Issuing needs a one-time opt-in per Stripe account, even in test mode.
2. That opt-in turned out to be a single "Get started" click in the **test sandbox** (no business verification needed for test mode — only live-mode access requires "contact sales").
3. After that, `stripe.issuing.cardholders.create` initially failed with `"outstanding requirements"` — Issuing cardholders need `individual.first_name`/`last_name` (not just a display name) and an explicit `card_issuing.user_terms_acceptance` (IP + timestamp) recorded, since a real cardholder agreement is being accepted on that person's behalf.
4. Once that was fixed, real virtual cards issue and activate successfully (`server/src/lib/cards.ts`'s `issueCard`), spending-limited to the vault's goal amount via `spending_controls.spending_limits`.
5. Merchant-decline simulation uses `stripe.testHelpers.issuing.authorizations.create` to run a **genuine** test-mode authorization against the real card — the "declined" event log entries you'll see (`insufficient_funds`, `cardholder_verification_required`, etc.) are real Stripe responses, not fabricated strings. One caveat: Stripe's test Issuing *balance* settles on its own simulated timeline (a "top up" shows as pending for a while), independent of this request, so the demo's success/decline outcome is driven by the lead's explicit choice rather than gated on that settlement timing — the real authorization attempt still runs and its result is logged transparently either way (`stripeVerified` in the event payload).
6. `issueCard` still falls back to a mocked card row (clearly marked `isMocked: true` in the UI) if Issuing ever isn't configured/available on a given Stripe account — so the app degrades gracefully rather than breaking Milestone 3's merchant-rejection flow.

## The Logic Simulator (`/simulator`, no login)

The hero feature for anyone evaluating this project without creating an account. It replays four fully scripted scenarios — Happy Path, Price Jump, Last-Minute Dropout, and Merchant Rejection — step by step, with play/pause/step/reset controls and a speed selector.

It's not a fake animation: `client/src/lib/simulator-scenarios.ts` defines each scenario as a sequence of vault-status snapshots, and at module load every consecutive status change in every scenario is run through the *real* `assertTransition` from `shared/src/state-machine.ts` — the same function the server calls on every request. If a scenario script ever encoded an illegal transition, the app would throw immediately rather than silently animating something the real engine would reject.

The page shows, in sync as it plays:
- A live-updating audit log using the real `VaultEventType` union
- A pledges panel with per-member hold/consent status (mirrors the real vault detail page's components)
- The virtual card and Proof-of-Funds certificate callouts at the right moments
- A full **state-machine diagram** (`client/src/components/state-machine-diagram.tsx`) — all 9 states and every legal transition, with the path the current scenario has actually taken highlighted in green against the muted full graph

## Local setup

Requires Node 20+.

```bash
npm install
```

1. **Database.** Create a free [Neon](https://neon.tech) Postgres project, copy the pooled connection string, then:
   ```bash
   cp server/.env.example server/.env
   # paste your DATABASE_URL into server/.env, and generate a SESSION_SECRET:
   openssl rand -hex 32
   ```
2. **Stripe.** Grab a test secret key from your [Stripe dashboard](https://dashboard.stripe.com/test/apikeys) and put it in `server/.env` as `STRIPE_SECRET_KEY`. Put the matching publishable key in `client/.env` as `VITE_STRIPE_PUBLISHABLE_KEY` (see `client/.env.example`). Issuing is optional — without it, card issuance falls back to the mock automatically.
3. **Push the schema:**
   ```bash
   npm run db:push
   ```
4. **Run everything:**
   ```bash
   npm run dev
   ```
   Client on http://localhost:5173, API on http://localhost:3001 (proxied under `/api`).

Without `DATABASE_URL` set, the server still boots — `/api/health` reports `databaseConfigured: false` and auth/vault routes return a clear `503` instead of crashing, so you can work on the frontend before wiring up a database. Same for `stripeConfigured`.

Auth is a **dev-login**: any name + email creates/logs into that user, no password. Intentionally lightweight per project scope — swap for something real before this ever touches actual funds. Sessions are stored in Postgres (`connect-pg-simple`, auto-creates its own `session` table), so restarting the server no longer logs everyone out.

## Deployment

The app deploys as a **single service**: in production, Express serves the built client (`client/dist`) as static files and handles `/api/*` itself — one process, one URL, no CORS to configure.

```bash
npm run build   # builds shared, server, and client in order
npm start        # NODE_ENV=production node server/dist/index.js
```

### Render (recommended)

This repo includes a `render.yaml` blueprint. In the Render dashboard: **New → Blueprint**, connect this GitHub repo, and Render reads `render.yaml` automatically. You'll be prompted for the secrets it can't generate itself:

- `DATABASE_URL` — your Neon pooled connection string
- `STRIPE_SECRET_KEY` — Stripe test secret key
- `VITE_STRIPE_PUBLISHABLE_KEY` — Stripe test publishable key (this one gets baked into the client bundle at build time, so it must be set *before* the first build)

`SESSION_SECRET` is auto-generated by Render. After deploy, run the schema push once (Render Shell, or locally against the same `DATABASE_URL`):

```bash
npm run db:push
```

### Replit (alternative)

This repo also includes a `.replit` config so it can be imported and run as-is. Add the same four secrets (`DATABASE_URL`, `SESSION_SECRET`, `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`) in Replit's **Secrets** panel, then hit Run — it builds and starts the same unified service.

## Known issue

`npm audit` reports a moderate-severity advisory in `drizzle-kit`'s bundled dev-time esbuild (a local dev-server request-forgery issue, [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)). It only affects `drizzle-kit`'s own tooling (e.g. `db:studio`) while running locally, not the app itself. No fix is currently available without downgrading `drizzle-kit` to an older, less capable release.

## Roadmap

1. ~~Scaffold repo, data model, lightweight auth~~ ✅
2. ~~Vault lifecycle: create → pledge (real Stripe test holds) → all-or-nothing `funded` trigger~~ ✅
3. ~~Edge-case engine: price jump, last-minute dropout, merchant rejection as real state transitions + event logging~~ ✅
4. ~~Execution layer: virtual card (real Stripe Issuing test mode) + Proof-of-Funds PDF~~ ✅
5. ~~Public Logic Simulator — no login, click a scenario, watch the state machine step through it live~~ ✅
6. Polish, deploy (Render/Replit + Neon), capture live demo URL — build verified locally end-to-end; live URL pending deploy
