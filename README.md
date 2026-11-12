# DayCloser

Turn open hours into paid bookings.

DayCloser helps Northlight Studio sell an open appointment. The merchant uses Bryntum Scheduler inside the Agent-Native workspace shell to select capacity, review a versioned campaign policy, and approve outreach. An Agent-Native worker sends a first invitation into a scoped demo inbox. A human reply can change the service and time. A five-minute hold reserves the shooting and buffer interval while PayPal Sandbox collects the deposit.

## Run locally

1. Install Node.js 22.22+ and pnpm 11.25.0. Use an isolated PostgreSQL database for the demo.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL` and a fresh `BETTER_AUTH_SECRET` from `openssl rand -hex 32`. Keep `DAYCLOSER_DEMO_MODE=1` to seed the synthetic studio.
3. Set `DAYCLOSER_MODEL_PROVIDER`, `DAYCLOSER_MODEL`, and the matching provider key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENROUTER_API_KEY`). For a local OpenAI-compatible tool-calling endpoint, use `DAYCLOSER_MODEL_PROVIDER=openai` and set `OPENAI_BASE_URL` to its loopback API address, such as `http://127.0.0.1:55811/v1`. A local server that does not require a key can use the placeholder `OPENAI_API_KEY=local` for the workspace composer.
4. Run `pnpm install --frozen-lockfile`, `pnpm migrate:production`, and `pnpm dev`. Use the loopback URL printed by the dev server. On a fresh local database the framework can create its local developer session on loopback. With a configured merchant email, sign in as that account.
5. Select Maya's 2:00–3:30 PM opening, choose **Sell this opening**, and approve the proposed policy. Open Alex's demo inbox link after the first invitation appears. The [demo script](docs/demo-script.md) covers the customer reply and checkout.

`pnpm demo:seed` seeds an empty studio explicitly. Set `DAYCLOSER_DEMO_DATE` before seeding to pick a specific Pacific date. `pnpm demo:reset --confirm` resets synthetic DayCloser state for the configured studio. It is for a disposable local demo database.

## PayPal Sandbox

In the PayPal Developer Dashboard, open a sandbox REST app and set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. Set `PAYPAL_MERCHANT_ID` to the sandbox business account's merchant ID and pay with a separate sandbox personal account. The customer page loads PayPal JS SDK v6 in sandbox mode. The server creates and captures a USD 30 order from the frozen offer. The UI shows payment as pending until the server verifies it.

For webhook verification, register the public HTTPS endpoint `/api/paypal/webhook` on that sandbox REST app and set `PAYPAL_WEBHOOK_ID`. Subscribe to `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.DENIED`. The Node process also reconciles unresolved attempts directly with PayPal. Protect the merchant account and keep server secrets out of the browser.

## Architecture

- **Agent-Native** provides the React Router, Vite, and Nitro app, merchant authentication and organization context, typed actions, application state, and live-sync transport. The outbound loop runs through the framework with a short list of sales tools. Its durable PostgreSQL job lease and retries keep processing independent of the merchant tab.
- **PostgreSQL and Drizzle** store the catalog, policy, offers, messages, holds, and payments. Reservation writers lock the studio row before changing capacity. Capture claims are durable across hold expiry and converge through the same finalizer as webhook and reconciliation results.
- **Bryntum Scheduler Enterprise 8.0.0** and its React wrapper render photographer rows, available windows, appointments, buffers, holds, and paid-deposit bookings from persisted state. The built-in trial runs without configuration. Set `VITE_BRYNTUM_LICENSE_KEY` to use a Bryntum Enterprise evaluation key.
- **PayPal Sandbox** provides the checkout and capture. **APIMatic PayPal Context Plugin** guided Codex's TypeScript SDK integration and review. The adapter uses the plugin's pinned SDK for Orders and refund operations. The implementation evidence documents those decisions and the separate PayPal webhook verification. [APIMatic usage](docs/apimatic-usage.md)

## Deploy and verify

Use a persistent Node host with PostgreSQL, a stable `BETTER_AUTH_SECRET`, a public HTTPS `APP_URL`, and the configured `DAYCLOSER_MERCHANT_EMAIL`. Set `DAYCLOSER_STUDIO_ORG_ID` if the merchant must operate from a specific Agent-Native organization. Use a service manager to keep the process running for background sales and payment reconciliation. Keep `DAYCLOSER_WORKER=1` on the worker process.

```sh
pnpm install --frozen-lockfile
pnpm migrate:production
pnpm build
pnpm start
```

Run `pnpm typecheck`, `pnpm agent-native:doctor`, and `pnpm test` for development checks. Set `DAYCLOSER_TEST_DATABASE_URL` to a separate disposable PostgreSQL database to run the integration tests. See [verification and remaining setup](docs/progress.md) for the checks exercised and the environment used. The [build brief](docs/build-brief.md) defines the MVP and its acceptance criteria.

DayCloser-authored code is MIT licensed. The Agent-Native starter's upstream MIT notice is preserved separately. Third-party dependencies retain their respective license terms.
