/**
 * Deposit refunds through the APIMatic-generated PayPal TypeScript SDK (`paypal`).
 * Written with the APIMatic Context Plugin for PayPal; the contract sheet is paypal-plan.md.
 *
 * Durable write order (plugin rule): claim -> SDK call -> record.
 *  - claim: a dc_refunds row, UNIQUE(capture_id), inserted before PayPal is called
 *  - call:  client.payments.refundCapturedPayment, PayPal-Request-Id = claim id
 *  - record: refund id + status on the claim; a lost answer is re-read with getCapturedPayment
 */
import { eq } from "drizzle-orm";
import { PaypalClient, PaypalError } from "paypal";

import { getDb } from "../db/index.js";
import * as t from "../db/schema.js";
import { logActivity, newId, now } from "./core.js";
import { money } from "./time.js";

function creds(): { clientId: string; clientSecret: string } | null {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (id && secret) return { clientId: id, clientSecret: secret };
  const both = process.env.PAYPAL_CREDENTIALS ?? "";
  const i = both.indexOf(":");
  return i > 0 ? { clientId: both.slice(0, i).trim(), clientSecret: both.slice(i + 1).trim() } : null;
}

let client: PaypalClient | null = null;

/** One client per process. The SDK's only environment is the sandbox; PAYPAL_API_BASE overrides via serverOptions.baseUrl. */
export function paypalSdk(): PaypalClient {
  if (client) return client;
  const proxyAuth = process.env.PAYPAL_PROXY_AUTH === "1";
  const c = creds() ?? (proxyAuth ? { clientId: "proxy", clientSecret: "proxy" } : null);
  if (!c) throw new Error("PayPal sandbox is not configured: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (or PAYPAL_CREDENTIALS).");
  // fetch is the SDK's one transport extension point. Behind a credential-injecting egress proxy,
  // drop the SDK's placeholder Basic header on the token call so the proxy's credential is used.
  const proxyFetch: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/v1/oauth2/token")) {
      const h = new Headers(init?.headers);
      h.delete("authorization");
      return fetch(input, { ...init, headers: h });
    }
    return fetch(input, init);
  };
  client = new PaypalClient({
    oauth2: c,
    ...(process.env.PAYPAL_API_BASE ? { serverOptions: { baseUrl: process.env.PAYPAL_API_BASE } } : {}),
    ...(proxyAuth ? { fetch: proxyFetch } : {}),
  });
  return client;
}

type RefundRow = typeof t.refunds.$inferSelect;

async function claimRefund(captureId: string, offerId: string, bookingId: string, amountCents: number): Promise<{ row: RefundRow; won: boolean }> {
  const db = getDb();
  const row = { id: newId("rf"), captureId, offerId, bookingId, amountCents, status: "claimed", paypalRefundId: "", detail: "", createdAt: now(), updatedAt: now() };
  try {
    await db.insert(t.refunds).values(row);
    return { row, won: true };
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code !== "23505") throw e;
    const [existing] = await db.select().from(t.refunds).where(eq(t.refunds.captureId, captureId));
    if (!existing) throw e;
    // A failed earlier attempt can be retried by taking the claim back.
    if (existing.status === "failed") {
      await db.update(t.refunds).set({ status: "claimed", detail: "", updatedAt: now() }).where(eq(t.refunds.id, existing.id));
      return { row: { ...existing, status: "claimed" }, won: true };
    }
    return { row: existing, won: false };
  }
}

async function record(id: string, patch: Partial<RefundRow>) {
  await getDb().update(t.refunds).set({ ...patch, updatedAt: now() }).where(eq(t.refunds.id, id));
}

/** Connection lost or timed out on the refund: PayPal may have acted. Re-read the capture before deciding. */
async function settleUnknown(row: RefundRow): Promise<string> {
  try {
    const cap = await paypalSdk().payments.getCapturedPayment({ captureId: row.captureId });
    if (cap.status === "REFUNDED" || cap.status === "PARTIALLY_REFUNDED") {
      await record(row.id, { status: "completed", detail: `confirmed by re-read: capture ${cap.status}` });
      return "completed";
    }
    await record(row.id, { status: "unknown", detail: `capture still ${cap.status}; refund outcome unknown` });
  } catch {
    await record(row.id, { status: "unknown", detail: "re-read failed; refund outcome unknown" });
  }
  return "unknown";
}

/**
 * Refund the PayPal deposit behind a cancelled DayCloser booking. The capture is looked up from the
 * booking's own paid offer, never taken from the caller.
 */
export async function refundDeposit(bookingId: string): Promise<{ status: string; refundId: string; amount?: string } | null> {
  const db = getDb();
  const [b] = await db.select().from(t.bookings).where(eq(t.bookings.id, bookingId));
  if (!b?.offerId) return null;
  const [offer] = await db.select().from(t.offers).where(eq(t.offers.id, b.offerId));
  if (!offer || offer.status !== "paid" || !offer.paypalCaptureId) return null;

  const campaignId = offer.campaignId;
  const { row, won } = await claimRefund(offer.paypalCaptureId, offer.id, b.id, offer.depositCents);
  if (!won) return { status: row.status, refundId: row.paypalRefundId };

  const value = (offer.depositCents / 100).toFixed(2);
  try {
    const refund = await paypalSdk().payments.refundCapturedPayment({
      captureId: offer.paypalCaptureId,
      payPalRequestId: row.id,
      prefer: "return=representation",
      body: {
        amount: { currencyCode: "USD", value },
        invoiceId: `${offer.id}-refund`,
        noteToPayer: `Lumen & Co. cancelled your session (${b.customerName}). Your ${money(offer.depositCents)} deposit is refunded in full.`.slice(0, 255),
      },
    });
    const status = refund.status === "COMPLETED" ? "completed" : (refund.status ?? "pending").toLowerCase();
    await record(row.id, { status, paypalRefundId: refund.id ?? "" });
    await db.update(t.offers).set({ status: "refunded", updatedAt: now() }).where(eq(t.offers.id, offer.id));
    await logActivity(campaignId, "refund", `Refunded ${b.customerName}'s ${money(offer.depositCents)} PayPal deposit (refund ${refund.id}, ${refund.status}).`);
    return { status, refundId: refund.id ?? "", amount: value };
  } catch (err) {
    if (err instanceof PaypalError) {
      switch (err.kind) {
        case "connection":
        case "timeout":
        case "decode": {
          const s = await settleUnknown(row);
          await logActivity(campaignId, "refund", `Refund for ${b.customerName} sent but PayPal's answer was lost; outcome ${s}.`);
          return { status: s, refundId: "" };
        }
        case "auth":
        case "encode":
          await record(row.id, { status: "failed", detail: `${err.kind}: nothing sent` });
          throw err;
        case "api":
          await record(row.id, { status: "failed", detail: `${err.kind}: ${err.message}`.slice(0, 500) });
          throw err;
      }
    }
    await record(row.id, { status: "failed", detail: String(err).slice(0, 500) });
    throw err;
  }
}
