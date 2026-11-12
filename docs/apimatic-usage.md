# APIMatic PayPal context

DayCloser uses [APIMatic's PayPal API Context Plugin](https://context.apimatic.io/plugins/paypal/) as development tooling. Agent-Native runs the sales agent.

The Codex-only installation used `npx --yes context-plugins install paypal --targets codex --ref 7cbdf85dc95f09d9ede8c5d349506686684fa0d4`. Codex CLI reported `paypal@context-plugins` installed and enabled at version 0.4.1. This session read the installed TypeScript skills from the plugin cache. A new Codex session discovers the plugin automatically.

The installed integration, getting-started, authentication, client initialization, calling endpoints, models, error handling, resilience, and testing skills guided the SDK lookup. DayCloser pins the context plugin's [TypeScript SDK](https://github.com/context-plugins/paypal-typescript-sdk/tree/5d0df8a8817e5fdf2e2cd48e68f790ea4730aab2), package `paypal` 2.29.0. The package is built from the pinned source commit. Its SDK map, Orders and Payments operation maps, and generated TypeScript resource and model definitions supplied the concrete interface.

| SDK lookup | DayCloser decision |
| --- | --- |
| Client options, OAuth scheme, and sandbox server | Reuse a server-only `PaypalClient` with OAuth client credentials and an explicitly selected sandbox host. |
| Orders create, capture, and get | Pass the database operation ID as `payPalRequestId`, request a full representation for create and capture, and look up the bound order after an uncertain capture. |
| Order, purchase unit, and capture models | Compare the provider's purchase unit reference, merchant, and captured amount to the accepted offer snapshot before booking. |
| Payments refund and get | Refund the bound capture using a distinct request ID and use the provider refund ID for subsequent status checks. |
| Error handling, resilience, and testing | Keep the reservation through timeouts, transport failures, and malformed responses. Test the actual SDK's HTTP request and decode path using its documented fetch injection. |

The SDK lacks webhook verification. The Nitro webhook uses the [PayPal raw-body signature procedure](https://developer.paypal.com/api/rest/webhooks/rest/) and checks the related order and capture against the authoritative Orders response. PayPal's [idempotency guidance](https://developer.paypal.com/api/rest/reference/idempotency/) defines the provider-specific request header and retry behavior. The customer checkout uses the [PayPal JavaScript SDK v6 sandbox integration](https://developer.paypal.com/checkout/integrate/).

See `server/daycloser/paypal-gateway.ts` for the provider calls, `server/daycloser/paypal.ts` for reservation and reconciliation, and `server/routes/api/paypal/webhook.post.ts` for the webhook entry point.

The booking transaction records a deterministic customer confirmation alongside the verified capture. DayCloser emits the internal booking event after commit so subscribers see the persisted booking and confirmation.

## Verification

The pinned SDK was built and imported in a scratch project before integrating it. Five fixture tests passed. They cover SDK OAuth and request encoding, order and capture decoding, raw signature verification, and recovery after a lost capture response. The tests verify that an unapproved or expired reservation cannot reach the capture API and that only the callback that acquires the reservation can submit the first capture. Run them with `pnpm test server/daycloser/paypal-gateway.test.ts server/daycloser/paypal.test.ts`.

A real checkout, capture, webhook delivery, and refund require a [PayPal sandbox app](https://developer.paypal.com/dashboard/applications/sandbox) and a sandbox buyer account. Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_MERCHANT_ID` for the same sandbox merchant. Register the deployed HTTPS `/api/paypal/webhook` for `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.DENIED`, then set the resulting `PAYPAL_WEBHOOK_ID`. The PayPal developer sandbox dashboard required sign-in when checked, so the live round trip remains unverified.
