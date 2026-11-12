# DayCloser

**Turn open hours into paid bookings.**

DayCloser is an outbound sales agent for appointment businesses. It finds unused capacity on the studio calendar, picks customers who opted in to hear about openings, sends each a personalised invitation with a concrete offer, adapts the offer when the customer replies, collects a deposit with PayPal, and confirms the booking only when the slot is still feasible.

The first version is built for one independent photography studio, Lumen & Co. Photography: two photographers, two predefined services and eight synthetic contacts (two of whom did not opt in and are never contacted).

## What happens in the demo

1. The merchant opens **Studio** and sees a Bryntum Scheduler timeline of both photographers over three days. Green dashed blocks are openings: never-booked time, or time freed by a cancellation (right-click any booking → *Customer cancelled* to create one live).
2. Click an opening → **Sell this opening**. The Agent-Native agent ranks opted-in contacts (service fit, photographer history, preferred day and time, time since last session), then sends the top two a personal invitation with a feasible offer.
3. Open a customer's **Customer view** link. The customer never started this conversation. They reply in their own words, e.g. *"Thursday's tricky, could we do Saturday morning instead?"*
4. The reply fires a server-side event. The agent reads it, calls `find-slots`, and replaces the offer with v2 (different day, time, photographer or the other service), explaining the change. Price and deposit always come from the service; there are no discounts and no invented services.
5. The customer pays the fixed deposit with **PayPal** (sandbox, Orders v2). The slot is held during checkout, re-checked at capture, and becomes a confirmed booking on the timeline. Every other invitation for that opening is closed politely.
6. If the studio later cancels a booking DayCloser sold, the PayPal deposit is **refunded automatically** (Payments v2 refund through the APIMatic-generated PayPal SDK), and the freed time shows up as a new opening the agent can sell again.

## Technology, each with one job

| Layer | Responsibility |
| --- | --- |
| **Builder.io Agent-Native** | App framework, the agent runtime and chat, shared typed actions (`actions/*.ts`) used by the agent, the UI and HTTP alike, SQL persistence and migrations, conversation persistence, UI context, and the server-side automation that runs the agent when a customer replies (`daycloser.customer.replied` event → `jobs/daycloser-adapt-offer.md`). |
| **Bryntum Scheduler** | The merchant's interactive resource timeline: photographers as resources, bookings, holds, cancellations and sellable openings as events; drag to move a booking (overlaps rejected server-side), context menu to cancel or sell. |
| **Bryntum Grid** | The **Customers** page: every contact with consent, wanted service, preferred days and times, last session, next booking and live DayCloser outreach status; grouped by consent, filter bar, row expander for notes and the current offer. |
| **Bryntum Calendar** | The **Calendar** page: the same bookings, openings and live offers in day, week, month and agenda views with a photographer filter; clicking an opening opens it in Studio to sell. |
| **PayPal sandbox** | Every PayPal call goes through the APIMatic-generated PayPal TypeScript SDK: Orders v2 `createOrder` / `getOrder` / `captureOrder` for the booking deposit, with idempotency keys (`PayPal-Request-Id`), a checkout hold, and capture-time feasibility re-check. Deposit refunds on cancellation via Payments v2 `refundCapturedPayment`. |
| **APIMatic Context Plugin for PayPal** | The plugin's TypeScript skills and the SDK map shipped with the APIMatic-generated PayPal TypeScript SDK (`paypal`) guided the coding agent that wrote the PayPal layer (`server/daycloser/paypal.ts`, `server/daycloser/refunds.ts`): they gave the exact signatures, error arms and durable-write rules. The contract sheet the plugin requires is [`paypal-plan.md`](paypal-plan.md): a `dc_refunds` claim with `UNIQUE(capture_id)` before the call, the claim id as `PayPal-Request-Id`, and a `getCapturedPayment` re-read when a refund's answer is lost. |

## Built with the APIMatic Context Plugin

The coding agent followed the plugin's `typescript-integrate-paypal` workflow (survey, a `paypal-plan.md` contract sheet with no open lookups, then code), reading the plugin's skills and the SDK's `sdk-map.md` directly. All PayPal calls (order create, get and capture; deposit refund and refund re-read) use the SDK. The SDK (`paypal` 2.29.0, built from `github:context-plugins/paypal-typescript-sdk`) is vendored as `vendor/paypal-2.29.0.tgz` so hosts that can't build git dependencies (Render) install it as a plain tarball.

## Shared actions

`get-studio`, `list-schedule`, `list-openings`, `sell-opening`, `rank-contacts`, `find-slots`, `send-invitation`, `get-campaign`, `list-campaigns`, `revise-offer`, `reply-to-customer`, `list-pending-replies`, `move-booking`, `cancel-booking`, `reset-demo`.

One feasibility rule (`checkSlot` in `server/daycloser/core.ts`) guards every offer, move, checkout and capture: the photographer offers the service, the slot is inside studio hours on a 15-minute boundary, at least 30 minutes out, and overlaps no confirmed booking or live checkout hold.

## Run it

```bash
pnpm install
cp .env.example .env   # set OPENROUTER_API_KEY (or another model key), PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
# local only: AUTH_DISABLED=true skips sign-in
pnpm dev
```

Open `/home` (Studio). Data is stored in local PGlite (`data/`) or Postgres via `DATABASE_URL`. Use **Reset demo** to reseed.

Bryntum is installed from the public trial package `@bryntum/calendar@npm:@bryntum/calendar-trial@7.3.8` with `@bryntum/calendar-react`; that bundle includes Scheduler and Grid, which power the Studio timeline and the Customers page.

PayPal: create a sandbox REST app at developer.paypal.com and pay with a sandbox *personal* account.

## Scope kept out of v1

Multi-business onboarding, CRM imports, calendar sync, SMS, voice, subscriptions, discounts, invented services, multiple agents, and analytics.

## License

MIT
