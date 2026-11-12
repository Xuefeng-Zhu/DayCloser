# Progress

The application uses Agent-Native Chat 0.227.0 and keeps its workspace navigation, chat and Inspector on the merchant side. The studio schedule uses Bryntum Scheduler Enterprise 8.0.0 and its matching Enterprise React wrapper. Customer inbox links open a scoped standalone page. The demo worker uses Agent-Native's event bus, interval driver, and bounded model loop with durable PostgreSQL job leases.

## Enterprise scheduler verification

Desktop Chrome rendered the built-in trial inside the authenticated Agent-Native workspace. The Pacific time axis aligned Maya’s paid 2:30 PM booking and its 3:00 PM buffer. Click and Enter selected openings in the campaign panel. The schedule rendered alongside the agent panel and followed the workspace’s light and dark themes. The frozen install, typecheck, and Agent-Native doctor passed.

## Campaigns and Calendar verification

In the authenticated Agent-Native workspace, the TaskBoard showed campaigns in five status columns. Mouse and keyboard activation opened the corresponding campaign policy. The Calendar showed the same studio day, photographer assignments, openings, and 2:30 PM Pacific paid booking as the timeline. Selecting a Calendar opening updated the campaign panel. Both views fit a 390 px viewport, the board scrolled within its panel, and both widgets followed the shell theme with the agent panel open.

## Original MVP verification

| Check | Result |
| --- | --- |
| Framework doctor and typecheck | Passed. |
| Production build | Passed with a deployment-shaped environment. The built Nitro server served the public inbox and returned HTTP 401 for the customer API without a scoped token. |
| Release migrations and guarded seed/reset | Passed on fresh, isolated PostgreSQL 18.6. Seeded two photographers and eight synthetic contacts. |
| PostgreSQL and PayPal integration tests | 15 tests passed. Coverage includes campaign and catalog authorization, concurrent holds and capture starts, hold expiry, pending-capture retention, capture/webhook dedupe, refund recovery, request IDs, and webhook signature verification. Provider responses in these tests are fixtures. |
| Desktop and mobile merchant UI | The native Agent-Native shell, controls, and light/dark themes render the interactive Bryntum schedule. Keyboard selection worked, and the mobile timeline scrolled within the workspace at 390 px. |
| Native Inspector | The restored composer accepted and submitted a read-only prompt after configuring the local endpoint. A reply about the selected opening was unverified within the browser wait. |
| Live sales agent | A local Qwen3-4B-Instruct-2507 model called the scoped Agent-Native tool to send Alex the Standard Headshot offer at 2:00 PM before any customer message. |
| Live customer reply and hold | Passed with the merchant tab closed. Alex’s reply produced an Express Headshot at 2:30 PM Pacific, with shooting through 3:00, a buffer through 3:10, and $100 total / $30 deposit / $70 due. The customer accepted a five-minute hold that survived reload. The 390 px browser viewport had no page overflow. |
| PayPal sandbox checkout, capture, and signed webhook | Passed November 12, 2026. A sandbox buyer approved the $30 USD deposit in PayPal Checkout. DayCloser captured the approved order with its persisted request ID and verified the matching signed `PAYMENT.CAPTURE.COMPLETED` event. Independent PayPal and PostgreSQL reads matched one $30 capture, one verified event, one booking, and one confirmation. The temporary test webhook and tunnel were removed. |

The live browser walkthrough used synthetic contacts and persisted in-app delivery. The restored merchant shell was verified in Chrome. The customer rerun used Playwright with Chrome after the browser connection detached. A verified payment finalizes the booking and stores one confirmation in the same transaction. The internal payment event is emitted after commit. The [APIMatic integration evidence](apimatic-usage.md) records the installed context and the provider operations reviewed.
