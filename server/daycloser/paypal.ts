import { and, eq } from "drizzle-orm";

import { getDb } from "../db/index.js";
import * as t from "../db/schema.js";
import { HOLD_MINUTES, checkSlot, getCampaignRow, getInvitationByToken, getService, logActivity, newId, now } from "./core.js";
import { fmtSlot, money } from "./time.js";

const API = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

/**
 * PAYPAL_PROXY_AUTH=1 is for sandboxes where an egress proxy injects the app's
 * credentials as HTTP Basic auth (PayPal REST accepts client_id:secret Basic auth),
 * so the secret never enters the process.
 */
const proxyAuth = () => process.env.PAYPAL_PROXY_AUTH === "1";

/** PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET, or PAYPAL_CREDENTIALS="CLIENT_ID:SECRET". */
function creds(): { id: string; secret: string } | null {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (id && secret) return { id, secret };
  const both = process.env.PAYPAL_CREDENTIALS ?? "";
  const i = both.indexOf(":");
  return i > 0 ? { id: both.slice(0, i).trim(), secret: both.slice(i + 1).trim() } : null;
}

export function paypalConfigured() {
  return proxyAuth() || !!creds();
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const c = creds();
  if (!c) throw new Error("PayPal sandbox is not configured: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (or PAYPAL_CREDENTIALS).");
  const { id, secret } = c;
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(`PayPal auth failed: ${j.error_description ?? res.status}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3000) * 1000 };
  return cached.token;
}

async function pp<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const auth: Record<string, string> = proxyAuth() ? {} : { Authorization: `Bearer ${await accessToken()}` };
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...auth,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.idempotencyKey ? { "PayPal-Request-Id": init.idempotencyKey } : {}),
    },
  });
  const text = await res.text();
  const j = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = j?.details?.[0]?.description || j?.message || res.statusText;
    const err = new Error(`PayPal ${res.status}: ${detail}`) as Error & { paypal?: unknown; status?: number };
    err.paypal = j;
    err.status = res.status;
    throw err;
  }
  return j as T;
}

async function currentOffer(invitationId: string) {
  const rows = await getDb().select().from(t.offers).where(eq(t.offers.invitationId, invitationId));
  return rows.sort((a, b) => b.version - a.version).find((o) => o.status !== "superseded") ?? null;
}

/** Customer pressed "Pay deposit": hold the slot, create a PayPal order for the fixed service deposit, return the approval URL. */
export async function startDepositCheckout(token: string, origin: string) {
  const inv = await getInvitationByToken(token);
  const camp = await getCampaignRow(inv.campaignId);
  if (camp.status === "won") throw new Error(camp.wonContactId === inv.contactId ? "You're already booked." : "Sorry, this opening was just booked by someone else.");
  const offer = await currentOffer(inv.id);
  if (!offer) throw new Error("There is no offer to pay for yet.");
  if (offer.status === "paid") throw new Error("This deposit is already paid.");
  const db = getDb();
  const svc = await getService(offer.serviceId);

  // Reuse a still-valid hold and order on a repeat click.
  const [existingHold] = await db.select().from(t.bookings).where(and(eq(t.bookings.offerId, offer.id), eq(t.bookings.status, "held")));
  if (offer.status === "checkout" && offer.paypalOrderId && existingHold && Date.parse(existingHold.holdExpiresAt) > Date.now()) {
    const order = await pp<{ links: { rel: string; href: string }[] }>(`/v2/checkout/orders/${offer.paypalOrderId}`);
    const approve = order.links.find((l) => l.rel === "approve" || l.rel === "payer-action");
    if (approve) return { approveUrl: approve.href, orderId: offer.paypalOrderId };
  }

  const check = await checkSlot(offer.photographerId, offer.serviceId, offer.startAt, existingHold?.id ?? "");
  if (!check.ok) throw new Error(`This time is no longer available: ${check.reason}`);

  const [ct] = await db.select().from(t.contacts).where(eq(t.contacts.id, inv.contactId));
  const holdId = existingHold?.id ?? newId("bk");
  const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60000).toISOString();
  if (existingHold) {
    await db.update(t.bookings).set({ holdExpiresAt, updatedAt: now() }).where(eq(t.bookings.id, holdId));
  } else {
    await db.insert(t.bookings).values({
      id: holdId,
      photographerId: offer.photographerId,
      serviceId: offer.serviceId,
      contactId: inv.contactId,
      customerName: ct?.name ?? "Customer",
      startAt: offer.startAt,
      endAt: offer.endAt,
      status: "held",
      source: "daycloser",
      offerId: offer.id,
      holdExpiresAt,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  const value = (offer.depositCents / 100).toFixed(2);
  const order = await pp<{ id: string; links: { rel: string; href: string }[] }>("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: `dc-${offer.id}-${holdExpiresAt}`,
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: offer.id,
          custom_id: offer.id,
          invoice_id: `${offer.id}-${Date.now()}`,
          description: `Deposit: ${svc.name}, ${fmtSlot(offer.startAt, offer.endAt)}`.slice(0, 127),
          soft_descriptor: "LUMEN CO PHOTO",
          amount: { currency_code: "USD", value },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Lumen & Co. Photography",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: `${origin}/offer/${token}?paypal=return`,
            cancel_url: `${origin}/offer/${token}?paypal=cancel`,
          },
        },
      },
    }),
  });
  await db.update(t.offers).set({ status: "checkout", paypalOrderId: order.id, updatedAt: now() }).where(eq(t.offers.id, offer.id));
  await logActivity(inv.campaignId, "checkout", `${ct?.name} started PayPal checkout for ${money(offer.depositCents)} (order ${order.id}); slot held ${HOLD_MINUTES} min.`);
  await db.update(t.campaigns).set({ status: "awaiting_payment", updatedAt: now() }).where(eq(t.campaigns.id, inv.campaignId));
  const approve = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve");
  if (!approve) throw new Error("PayPal did not return an approval link.");
  return { approveUrl: approve.href, orderId: order.id };
}

/** Back from PayPal: capture the order, then turn the hold into a confirmed booking and close the campaign. */
export async function captureDeposit(token: string, orderId: string) {
  const inv = await getInvitationByToken(token);
  const db = getDb();
  const [offer] = await db.select().from(t.offers).where(eq(t.offers.paypalOrderId, orderId));
  if (!offer || offer.invitationId !== inv.id) throw new Error("This PayPal order does not belong to this invitation.");
  if (offer.status === "paid") return { ok: true, already: true, bookingId: (await getCampaignRow(inv.campaignId)).bookingId };

  const [hold] = await db.select().from(t.bookings).where(eq(t.bookings.offerId, offer.id));
  const camp = await getCampaignRow(inv.campaignId);
  if (camp.status === "won" && camp.wonContactId !== inv.contactId) throw new Error("Sorry, this opening was booked by someone else before payment finished. You have not been charged.");
  const check = await checkSlot(offer.photographerId, offer.serviceId, offer.startAt, hold?.id ?? "");
  if (!check.ok) throw new Error(`The time is no longer available (${check.reason}). You have not been charged.`);

  type Capture = { id: string; status: string; purchase_units: { payments: { captures: { id: string; status: string; amount: { value: string } }[] } }[] };
  let cap: Capture;
  try {
    cap = await pp<Capture>(`/v2/checkout/orders/${orderId}/capture`, { method: "POST", idempotencyKey: `dc-cap-${orderId}` });
  } catch (e) {
    const err = e as Error & { paypal?: { details?: { issue?: string }[] } };
    if (err.paypal?.details?.[0]?.issue === "ORDER_ALREADY_CAPTURED") {
      cap = await pp<Capture>(`/v2/checkout/orders/${orderId}`);
    } else throw e;
  }
  const capture = cap.purchase_units?.[0]?.payments?.captures?.[0];
  if (cap.status !== "COMPLETED" || !capture || capture.status !== "COMPLETED") throw new Error(`PayPal capture not completed (status ${capture?.status ?? cap.status}).`);

  const ts = now();
  const bookingId = hold?.id ?? newId("bk");
  const [ct] = await db.select().from(t.contacts).where(eq(t.contacts.id, inv.contactId));
  if (hold) {
    await db.update(t.bookings).set({ status: "confirmed", holdExpiresAt: "", updatedAt: ts }).where(eq(t.bookings.id, hold.id));
  } else {
    await db.insert(t.bookings).values({ id: bookingId, photographerId: offer.photographerId, serviceId: offer.serviceId, contactId: inv.contactId, customerName: ct?.name ?? "Customer", startAt: offer.startAt, endAt: offer.endAt, status: "confirmed", source: "daycloser", offerId: offer.id, createdAt: ts, updatedAt: ts });
  }
  await db.update(t.offers).set({ status: "paid", paypalCaptureId: capture.id, updatedAt: ts }).where(eq(t.offers.id, offer.id));
  await db.update(t.invitations).set({ status: "booked", needsAgent: 0, updatedAt: ts }).where(eq(t.invitations.id, inv.id));
  await db.update(t.campaigns).set({ status: "won", wonContactId: inv.contactId, bookingId, updatedAt: ts }).where(eq(t.campaigns.id, inv.campaignId));
  const svc = await getService(offer.serviceId);
  await db.insert(t.messages).values({
    id: newId("ms"),
    invitationId: inv.id,
    role: "system",
    body: `Deposit of ${money(offer.depositCents)} received via PayPal (capture ${capture.id}). You're booked: ${svc.name}, ${fmtSlot(offer.startAt, offer.endAt)}. The remaining ${money(offer.priceCents - offer.depositCents)} is due at the session.`,
    offerId: offer.id,
    createdAt: ts,
  });
  // Every other invitation for this opening is told politely that it is gone.
  const others = await db.select().from(t.invitations).where(eq(t.invitations.campaignId, inv.campaignId));
  for (const o of others) {
    if (o.id === inv.id || ["declined", "booked", "closed"].includes(o.status)) continue;
    await db.update(t.offers).set({ status: "expired", updatedAt: ts }).where(and(eq(t.offers.invitationId, o.id), eq(t.offers.status, "proposed")));
    await db.update(t.invitations).set({ status: "closed", needsAgent: 0, updatedAt: ts }).where(eq(t.invitations.id, o.id));
    await db.insert(t.messages).values({ id: newId("ms"), invitationId: o.id, role: "system", body: "This opening has just been booked. Thanks for your interest; we'll reach out when another time fits.", offerId: "", createdAt: ts });
  }
  await logActivity(inv.campaignId, "paid", `${ct?.name} paid ${money(offer.depositCents)} via PayPal (capture ${capture.id}). Booking confirmed: ${svc.name}, ${fmtSlot(offer.startAt, offer.endAt)}.`);
  return { ok: true, bookingId, captureId: capture.id, amount: capture.amount.value };
}

export async function cancelCheckout(token: string) {
  const inv = await getInvitationByToken(token);
  const db = getDb();
  const rows = await db.select().from(t.offers).where(and(eq(t.offers.invitationId, inv.id), eq(t.offers.status, "checkout")));
  for (const o of rows) {
    await db.update(t.offers).set({ status: "proposed", updatedAt: now() }).where(eq(t.offers.id, o.id));
    await db.update(t.bookings).set({ status: "released", updatedAt: now() }).where(and(eq(t.bookings.offerId, o.id), eq(t.bookings.status, "held")));
  }
  return { ok: true };
}
