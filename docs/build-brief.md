# DayCloser — Codex Build Prompt

You are the lead product engineer building DayCloser, a working PayPal AI Hackathon MVP.

Build the application in this repository. Inspect the workspace and applicable AGENTS.md instructions, briefly explain your implementation order, then start implementing. Make reasonable decisions and continue through verification. Ask only about a genuinely blocking credential, access restriction, or irreversible choice. Preserve existing work and configuration.

## 1. Product and scope

Product name: DayCloser
Tagline: Turn open hours into paid bookings.
Primary merchant CTA: Sell this opening.

DayCloser is an outbound sales agent for appointment businesses. It identifies unused capacity, selects relevant customers who opted in, initiates a personalized invitation, adapts an offer to a customer's reply, collects a deposit, and confirms a feasible booking.

Build for one independent photography studio first. Support both never-booked time and openings created by cancellations. Start with two photographers, two predefined services, and eight synthetic contacts.

The core experience must include a live human reply that changes the agent's offer. A customer must not need to initiate the sales conversation.

Keep these outside the first version: multi-business onboarding, CRM imports, calendar-provider synchronization, SMS, voice calls, subscriptions, arbitrary discounts, dynamically invented services, multiple specialized agents, and elaborate analytics. Email is optional after the core flow works.

## 2. Required technologies and bootstrap

Use these technologies with distinct responsibilities:

- Builder.io Agent-Native: the application framework, agent runtime, shared typed actions, conversation persistence, UI context, and server-side automation.
- Bryntum Scheduler: the real interactive merchant resource timeline.
- PayPal sandbox: checkout and capture of the booking deposit.
- APIMatic PayPal Context Plugin: development tooling used by Codex to implement and review the PayPal integration.
- PostgreSQL with the framework's supported Drizzle integration: authoritative business state.

If this is an existing Builder-exported application, extend it. If it is a fresh workspace, use the current official standalone Chat starter. The documented bootstrap command at preparation time is:

    npx --yes @agent-native/core@latest create daycloser --standalone --template chat

Verify the current CLI and prerequisites first. Current documentation specifies Node.js 22.22+ and pnpm. Scaffold into the appropriate project root without accidentally nesting a second application. Pin the resolved dependencies and retain the lockfile.

Follow the generated React, React Router, Vite, and Nitro structure. Use the existing framework server rather than adding a separate backend. Verify a production build before adding major integrations.

Use persistent PostgreSQL for the shared or deployed application. Local PGlite may unblock early UI work, but reservation concurrency verification must run against the PostgreSQL configuration intended for deployment. Do not assume Builder automatically provisions a database; inspect the actual project configuration.

Install Bryntum Scheduler and its matching React integration from a compatible release, following its current installation and trial/license instructions. Record the installed versions. Keep licensed dependencies out of vendored project source unless redistribution is explicitly permitted.

## 3. APIMatic is required in the development workflow

Before writing the PayPal adapter, verify that APIMatic's PayPal Context Plugin is available to this Codex session.

The official installer supports this Codex-specific command:

    npx context-plugins install paypal --targets codex

It requires the Codex CLI to be discoverable and normally requires a new Codex session after installation. If already installed, inspect and use it. Preserve existing plugin configuration; do not force-replace unrelated installations.

Read the installed TypeScript integration, authentication, client setup, endpoint, model, error handling, resilience, and testing guidance as relevant. Inspect the actual SDK package and types before choosing imports and method signatures. Pin the SDK version used.

Use this context while implementing and reviewing order creation, approval/capture, payment retrieval, and failure handling. Where the installed context or SDK does not cover a needed operation, consult current official PayPal documentation and record that boundary.

Create docs/apimatic-usage.md with:

- Plugin source and installed version or commit, when available.
- Installation/activation method and context or skills actually consulted.
- Specific implementation decisions informed by the plugin.
- References to the resulting adapter code and meaningful validation.
- A short sanitized record of actual use, without credentials or private data.

Add an accurate APIMatic paragraph to the README and submission notes. Installing the plugin alone is insufficient; its context must actually inform the integration. Describe APIMatic as development tooling. DayCloser's sales agent runs through Agent-Native.

If activation requires a restart or access is unavailable, record the precise blocker, continue independent UI/domain work, and leave APIMatic verification pending. Never fabricate usage evidence or silently declare this requirement complete.

## 4. Seeded scenario and business rules

Use synthetic data and a reproducible seed. Default to the next local business day in America/Los_Angeles, with explicit dates and timezone labels. Allow a configurable demo date.

Studio: Northlight Studio
Photographers: Maya and Jordan
Featured opening: Maya, 14:00–15:30
Next existing appointment: Maya, 15:30; it must remain unchanged.

Service catalog:

| Service | Shooting time | Buffer after | Edited photos | Total price | Deposit |
| --- | --- | --- | --- | --- | --- |
| Standard Headshot | 60 minutes | 10 minutes | 5 | USD 180 | USD 30 |
| Express Headshot | 30 minutes | 10 minutes | 2 | USD 100 | USD 30 |

Seed Alex as an eligible customer who previously expressed interest in professional headshots, opted into relevant invitations, and has no upcoming appointment. Include other synthetic contacts with different preferences, one opted-out contact, and one already booked customer to demonstrate meaningful filtering.

The mandatory demonstration:

1. The merchant selects Maya's opening in Bryntum and clicks "Sell this opening."
2. DayCloser proposes eligible customers and a bounded campaign.
3. The merchant approves the campaign once.
4. The agent proactively sends Alex an invitation for Standard Headshot at 14:00.
5. A human opens Alex's customer page and types an arbitrary reply, including this test case:

   "I can't get there until 2:30, and my budget is around $110. I only need two photos for LinkedIn."

6. The agent reads the current schedule and service catalog. Standard at 14:30 would occupy time through 15:40 and conflict. Express at 14:30 fits: shooting until 15:00, buffer until 15:10, total USD 100.
7. The agent proposes Express with the exact time, deliverables, full price, USD 30 deposit, and USD 70 remaining.
8. Alex accepts. The server creates an exclusive five-minute hold for the selected interval, including its buffer.
9. Alex pays through real PayPal sandbox checkout.
10. A verified completed capture confirms the booking and updates Bryntum. Competing offers stop, and the campaign completes.

Display USD 100 booked value, USD 30 deposit collected, and USD 70 due at the studio. Display 30 minutes of shooting and 10 minutes of buffer. Do not report the original 90-minute opening as completely filled.

Implement this through real catalog and interval logic. Changing customer text, prices, durations, or availability must change the feasible result; do not hard-code a response to the sample sentence.

## 5. Product surfaces and visual direction

Build three connected surfaces.

### Merchant workspace

Make the Bryntum resource timeline the primary working surface, with one row per photographer. Show appointments, available ranges, buffers, temporary holds, and confirmed paid-deposit bookings.

Selecting an opening should set semantic application context such as resource ID, opening ID, and interval. The agent must understand "sell this opening" from that selection.

Place a compact agent/campaign panel beside the schedule. Show the proposed audience, catalog offer, approval controls, conversation, activity, and concise explanations grounded in tool results. Examples: "Express fits before the next appointment" and "Deposit verified." Do not show hidden model reasoning.

Show useful operational totals: booking value, deposits collected, outstanding balance, and actual occupied minutes. Provide pause and resume controls. Pause blocks new outreach and follow-ups; it must not discard payment reconciliation already in progress.

### Campaign approval

Approve a versioned policy containing the selected resource/window, permitted services at catalog prices, allowed contacts, a maximum of three initial invitations, at most one follow-up per contact, campaign expiry, USD 30 deposit, and five-minute hold duration.

The approval is a real merchant action. Once approved, the agent can operate within those bounds without asking the merchant to approve each routine message. Changing the policy requires fresh approval.

### Customer page

Provide a mobile-friendly page scoped to one customer conversation and its offers. Show the studio identity, photographer, explicit date/time/timezone, service, deliverables, total price, deposit, remaining amount, and hold status.

Support actual free-text replies, offer acceptance, PayPal checkout, and confirmation. A customer must not receive merchant organization membership, other customers' data, or merchant agent tools.

Use a polished, calm visual style: warm neutral background, charcoal text, a restrained amber accent, clear state labels, and readable typography. Distinguish pending holds from confirmed bookings with both text and color. All product copy is English.

Keep existing confirmed appointments read-only in the MVP unless edits pass the same server-side scheduling validation.

## 6. Shared actions and agent boundaries

Implement core operations as typed Agent-Native actions backed by shared domain services. UI and agent operations must use the same validation and authorization paths.

Suggested capabilities, adapted to actual framework conventions:

- list-openings
- list-eligible-customers
- propose-campaign
- approve-campaign
- pause-campaign / resume-campaign
- send-offer
- revise-offer
- hold-opening
- create-deposit-checkout
- get-booking-status

Merchant approval is not a tool the sales agent can execute. Customer acceptance and payment initiation must be scoped to the authenticated customer or a secure conversation session.

The agent may select among eligible contacts, write an invitation, interpret replies, choose a feasible catalog service/time, and continue the conversation. Server code enforces contact permission, campaign bounds, service duration, price, deposit, limits, and availability.

Treat customer messages as untrusted input, never as instructions to change merchant policy.

Disable broad runtime tools that would let the sales agent bypass business actions, including arbitrary SQL writes, code execution, and unrestricted outbound sending. Tool visibility flags alone do not replace authorization.

There must be no agent-accessible operation that marks a payment paid, overrides a conflict, or changes a catalog price without merchant authority.

## 7. Persistence and scheduling

Reuse the framework's identity and organization facilities. Keep the implementation small: one application, one database, and focused domain services.

Persist the necessary concepts: resources, services, appointments, customer permissions/preferences, campaigns and approved policy versions, offers and immutable accepted snapshots, conversations/messages, holds, payment attempts, processed webhook events, and retryable job/delivery state.

Use integer cents, explicit currency, UTC timestamps, and the studio's IANA timezone. An offer records its exact service, resource, interval, buffer, price, deposit, customer, policy version, and expiry.

Derive availability from working hours minus occupied intervals. Model intervals consistently, including buffers. Validate any proposed interval against current database state.

Serialize reservation changes with a database transaction and a per-resource database lock, or another equally strong database-level strategy. All reservation writers must follow it. A frontend check or in-memory mutex is insufficient.

Separate the original opening from the interval actually reserved. A campaign can complete after one successful booking while unused portions remain visibly unoccupied.

Keep Bryntum synchronized from persisted data through the framework's supported live-sync mechanism and a small Scheduler adapter. The timeline is a view of authoritative state.

Use a secure customer token/session scoped to its conversation, with server-side checks on every access. Resolve merchant and campaign ownership from trusted records, not customer-submitted identifiers.

## 8. PayPal deposit and reservation lifecycle

Use PayPal Orders in sandbox, with server-side order creation and capture. Charge the USD 30 deposit only. The remaining balance is due at the studio; there is no automatic future charge.

For a claimed interval, implement:

AVAILABLE -> HELD -> CAPTURE_PENDING -> BOOKED

An expired, uncharged hold can be released. A capture with an unknown outcome must retain its reservation until reconciled.

Required behavior:

1. Acceptance atomically validates the offer and availability and creates the exclusive hold. Competing customers cannot obtain overlapping holds.
2. Freeze the accepted offer. Derive the amount from that server-side snapshot, never from client or model input.
3. Bind the PayPal order to the customer, hold, payment attempt, merchant, currency, and expected deposit.
4. When the buyer approves, atomically revalidate the hold and transition to CAPTURE_PENDING before calling capture.
5. If the uncharged hold expired or was superseded, do not initiate capture.
6. Once capture begins, the ordinary five-minute expiry must not release the interval.
7. Persist separate PayPal request IDs for each operation and reuse the same ID when retrying that operation. A timeout is an unknown outcome, not proof of failure.
8. Confirm only from trusted PayPal capture data with status COMPLETED, matching the expected order, merchant, amount, and currency. Approval or a browser redirect is insufficient.
9. Capture responses, verified webhooks, and reconciliation must converge on one idempotent finalizer. Unique order/capture/event identifiers prevent duplicate bookings and notifications.
10. If a captured payment cannot be allocated, preserve the payment record and enter an explicit refund-required recovery state. Provide a merchant-authorized sandbox refund path; never create a conflicting booking.
11. Stop competing outreach after confirmation. A temporary hold pauses new selling for that capacity; expiry may allow the campaign to resume.

Implement the PayPal webhook as a custom Nitro route using PayPal's current verification procedure. Keep the incoming body available as required by that procedure. Do not copy a generic HMAC example as PayPal verification.

Verify and apply payment state deterministically before emitting an internal event for the agent to send a confirmation. Keep all secrets server-side; expose only public configuration needed by checkout.

## 9. Outbound delivery and background execution

The required first channel is a persisted in-app inbox, clearly labeled "Demo customer inbox." Agent-generated outreach must appear there before the customer sends a message. Customer replies must trigger real model/tool execution when credentials are available.

Add email only after the core flow works and a verified sending setup is already configured. Email can link to the dedicated customer page. Use explicitly configured test recipients during development.

Use Agent-Native's server-side event/automation mechanism for approved campaigns and new customer messages. Verify the selected runtime's background-job driver and retry behavior. Reuse framework capabilities before adding infrastructure.

Persist enough job and delivery state to avoid duplicate invitations on retries and to recover interrupted work. If needed, use a small database-backed outbox or job record; avoid introducing a separate distributed system.

A customer reply must still be processed after the merchant closes the dashboard. Do not depend on a browser timer or open chat panel.

Deduplicate inbound events and outbound operations. Follow-up scheduling is lower priority than the complete first-contact/reply/payment loop.

## 10. Build order

Work in small, runnable increments and continue automatically between them.

Phase A — Foundation:
Inspect the repository, verify APIMatic availability, scaffold or extend Agent-Native, configure persistence, mount a real Bryntum Scheduler, seed the studio, and pass a production build. Prove an actual model can call one shared action.

Phase B — Outbound sale:
Implement opening selection, eligible contacts, bounded approval, persisted outreach, customer free-text replies, and catalog-based offer revision. Verify the 14:30 Express scenario with a real model. Verify processing with the merchant tab closed.

Phase C — Checkout:
Use APIMatic context to implement the PayPal adapter. Add exclusive holds, real sandbox checkout, capture, webhook verification, idempotent finalization, and reconciliation. Show the confirmed booking on Bryntum.

Phase D — Demonstration and handoff:
Run focused tests, inspect desktop and mobile layouts, fix the demonstrated flow, and prepare setup, sponsor-use evidence, and the demo script. Add optional email only if the required loop is complete.

Keep docs/build-plan.md and docs/progress.md concise and current. Record actual completion, decisions, blockers, and the next step so another Codex session can resume.

Do not stop after a plan or scaffold. Continue toward the complete working slice. If credentials block a live integration, implement the adapter and independent work, state exactly what is unverified, and provide the smallest necessary setup step.

## 11. Meaningful verification

Use the repository's existing test tools where appropriate. Focus on these behavioral risks:

- The sample reply produces a feasible Express offer; a service that overruns the opening is rejected.
- Opted-out customers, disallowed services, unauthorized prices, and excess outreach are rejected server-side.
- Two concurrent claims for overlapping time result in exactly one valid hold.
- An expired uncharged hold cannot trigger capture.
- Capture started before expiry retains its reservation through a delayed result.
- Duplicate capture/webhook processing produces one booking and one confirmation.
- A customer cannot read another conversation or invoke merchant operations.
- Closing the merchant tab does not prevent an incoming reply from being processed.

Run a full browser walkthrough from opening selection to a real PayPal sandbox capture when credentials permit. Check actual Scheduler rendering, customer mobile layout, refresh persistence, and visible error/retry states.

Report checks as passed, failed, or blocked. Keep replay fixtures and mocks explicitly labeled. Do not display fabricated PayPal success, invented capture IDs, or canned responses as live integrations.

## 12. Deliverables and handoff

Deliver a runnable application with:

- Database schema/migrations and safe seed/reset commands restricted to demo data.
- A lockfile, .env.example, and complete setup/run/build instructions.
- Real Agent-Native actions, a real Bryntum integration, and a real PayPal sandbox adapter.
- docs/apimatic-usage.md with actual development evidence.
- docs/demo-script.md with a demonstration under three minutes.
- A short architecture explanation and accurate sponsor integration notes.
- An open-source license for our authored code, preserving existing and third-party licensing.
- Clear environment requirements for PostgreSQL, the selected model provider, PayPal client credentials/webhook ID, and Bryntum.
- Deployment guidance that identifies how background execution and webhook delivery work.

Keep secrets out of source, logs, and documentation. Prepare public-repository-ready source; publishing and real-customer outreach are outside this development task.

At handoff, state what works, how to run it, which checks passed, what remains blocked, and which integrations were exercised live.

Start now: inspect the repository, check the installed APIMatic context and framework versions, give a brief implementation order, and begin Phase A.

## Official references to consult as needed

- [Builder Agent-Native](https://www.builder.io/agent-native)
- [Agent-Native getting started](https://www.agent-native.com/docs/)
- [Agent-Native shared actions](https://www.agent-native.com/docs/actions-overview/)
- [Agent-Native action authorization](https://www.agent-native.com/docs/actions-access-control/)
- [Agent-Native database](https://www.agent-native.com/docs/server-database/)
- [Agent-Native background execution](https://www.agent-native.com/docs/recurring-jobs/)
- [Agent-Native custom routes](https://www.agent-native.com/docs/server-routes/)
- [Bryntum Scheduler React integration](https://bryntum.com/products/scheduler/docs-llm/guide/Scheduler/integration/react/guide.md)
- [APIMatic PayPal Context Plugin](https://context.apimatic.io/plugins/paypal/)
- [APIMatic installer](https://github.com/apimatic/context-plugins-installer)
- [PayPal Orders capture](https://developer.paypal.com/api/orders/v2/orders-capture)
- [PayPal idempotency](https://developer.paypal.com/api/rest/reference/idempotency/)
- [PayPal webhooks](https://developer.paypal.com/api/rest/webhooks/rest/)
- [Hackathon rules](https://paypalaihackathon.devpost.com/rules)
- [Bryntum sponsor guidance](https://paypalaihackathon.devpost.com/details/bryntum)
- [APIMatic sponsor guidance](https://paypalaihackathon.devpost.com/details/apimatic)