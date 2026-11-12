# PayPal plan — deposit refund on cancellation

Written following the **APIMatic Context Plugin for PayPal** (plugin v0.4.1; its skills were read from the plugin repo:
skills `typescript-integrate-paypal`, `typescript-getting-started`, `typescript-client-initialization`,
`typescript-calling-endpoints`, `typescript-error-handling`, `typescript-configuration-resilience`).
Every fact below comes from the SDK map shipped in `node_modules/paypal/sdk-map.md` and
`node_modules/paypal/map/operations/payments.md`, not from memory.

## Scope
When the studio cancels a booking that DayCloser sold with a paid PayPal deposit, refund that deposit
to the customer through the APIMatic-generated PayPal TypeScript SDK (`paypal`, client `PaypalClient`),
then free the slot so the agent can resell it. Follow-up (same rules): Orders v2 create/get/capture in `server/daycloser/paypal.ts`
moved onto the same SDK (`createOrder` with `PayPal-Request-Id` per hold, `captureOrder` with `PayPal-Request-Id` per order and an
empty JSON body, `getOrder` re-read on ORDER_ALREADY_CAPTURED or a lost answer). Verified in sandbox: order 80K28107JA907764R captured
(72003549W4948223C, $45.00) and refunded on cancel (0N95201633641864X).

## Repo survey
- ESM (`"type": "module"`), Node >= 22, TypeScript via `@agent-native/core/tsconfig.base.json`.
- DB: Drizzle on Postgres/PGlite, migrations in `server/plugins/db.ts` (append-only, versioned).
- Exemplar for PayPal domain code: `server/daycloser/paypal.ts`. Exemplar action: `actions/cancel-booking.ts`.
- Checks: `pnpm typecheck`, `pnpm build`.

## Client (contract)
- `new PaypalClient({ oauth2: { clientId, clientSecret } })` — one client per process, built lazily.
- Host: the SDK declares one environment (`https://api-m.sandbox.paypal.com`); other hosts only via
  `serverOptions.baseUrl` (we pass `PAYPAL_API_BASE` when set).
- Credentials from `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` or `PAYPAL_CREDENTIALS`.
- Sandboxes where an egress proxy injects Basic auth (`PAYPAL_PROXY_AUTH=1`): a custom `fetch`
  (the SDK's one transport extension point) strips the SDK's own `Authorization` header on
  `/v1/oauth2/token` so the proxy's credential is used; Bearer tokens on other calls pass through.
- Import the model type `Error` aliased (`Error as SdkError`) if ever needed; never deep-import.

## Operation in scope
`client.payments.refundCapturedPayment(request, options?) -> ApiPromise<Refund, Payments.RefundCapturedPaymentError>`
- Wire: `POST /v2/payments/captures/{capture_id}/refund`, auth `oauth2`.
- Fields: `captureId` (path, required) · `payPalRequestId` (header `PayPal-Request-Id`) ·
  `prefer` (header, default `"return=minimal"`; we send `"return=representation"`) · `body: RefundRequest` (optional).
- `RefundRequest`: `amount?: Money { currencyCode, value }`, `invoiceId?`, `noteToPayer?`, `customId?`.
- Returns `Refund`: `id?`, `status?: RefundStatus` (`CANCELLED | FAILED | PENDING | COMPLETED`), `amount?`.
- Errors: `PaypalError`; `kind: "api"` arms `error` 400, `error2` 401, `error3` 403, `error4` 404,
  `error5` 409, `error6` 422, `error500`, `error7` default, `undeclared`. `connection`/`timeout`
  on a write = **unknown outcome**. `auth`/`encode` = never sent.
- Re-read: `client.payments.getCapturedPayment({ captureId })` → `CapturedPayment.status`
  (`PARTIALLY_REFUNDED`/`REFUNDED` means the refund landed).

## 1b.1 Durable writes

**DUPLICATE CLAIMS**

| Write | Where the claim is stored | What rejects the second one | Where that rejection is caught | Where in the code |
| --- | --- | --- | --- | --- |
| refundCapturedPayment | `dc_refunds` row inserted with status `claimed` before the call | `UNIQUE (capture_id)` on `dc_refunds` | `refundDeposit()` catch on unique-violation (`23505`), returns the winner's row | `server/daycloser/refunds.ts` `claimRefund()` |

The claim's id is also sent as `PayPal-Request-Id`, so PayPal itself de-duplicates a replay of the same claim.
A provider refusal (`kind: "api"`) marks the claim `failed`; a later cancel can retry.

**UNKNOWN OUTCOMES**

| Write | The operation you re-read with | The reference you search by | Where in the code | The test that fails the connection |
| --- | --- | --- | --- | --- |
| refundCapturedPayment | `payments.getCapturedPayment` | the `captureId` on the claim | `server/daycloser/refunds.ts` `settleUnknown()` | manual sandbox smoke (see Verified) |

`auth` / `encode` errors: nothing left PayPal; claim → `failed`, no re-read.

## 1b.2 Cross-operation invariants

| Invariant | Where the legal set comes from | Enforced where | The test that proves it |
| --- | --- | --- | --- |
| Only refund a capture this app recorded for the cancelled booking | `dc_offers.paypal_capture_id` of the offer whose `id = booking.offer_id` and `status = 'paid'` | `refundDeposit()` looks the capture up from the booking, never from caller input | sandbox smoke on booking bk_mwdpjqfc7d5766 |
| Refund amount = the deposit actually paid | `dc_offers.deposit_cents` | `refundDeposit()` | same |

## Assumptions & blockers
- Full deposit refund on studio-side cancellation (policy choice for the demo).
- No open lookups.

## Verified (2026-11-12 10:25 PST, PayPal sandbox)
- `cancel-booking` on bk_mwdpjqfc7d5766 (paid via order 8PE96686TC417011P, capture 5HD48752TL7748509) →
  `refundCapturedPayment` → refund **9V113816967640532, COMPLETED, $60.00**; offer marked `refunded`, slot freed.
- Second `cancel-booking` on the same booking → `{ already: true }`, no second PayPal call.
