import { and, eq } from "drizzle-orm";
import { CheckoutPaymentIntent, PayPalExperienceUserAction, PayPalWalletContextShippingPreference, PaypalError } from "paypal";
import type { Order } from "paypal";

import { getDb } from "../db/index.js";
import * as t from "../db/schema.js";
import { HOLD_MINUTES, activeBookings, checkSlot, getCampaignRow, getInvitationByToken, getService, logActivity, newId, now } from "./core.js";
import { fmtSlot, money } from "./time.js";
import { paypalSdk } from "./refunds.js";

/**
 * Every PayPal call goes through the APIMatic-generated PayPal TypeScript SDK (`paypal`),
 * following the APIMatic Context Plugin for PayPal's skills (contract sheet: paypal-plan.md).
 */
export function paypalConfigured() {
  return process.env.PAYPAL_PROXY_AUTH === "1" || !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) || (process.env.PAYPAL_CREDENTIALS ?? "").includes(":");
}

/** The PayPal error issue code (e.g. ORDER_ALREADY_CAPTURED) from a typed SDK error arm, if any. */
function issueOf(err: unknown): string {
  if (!(err instanceof PaypalError) || err.kind !== "api") return "";
  const payload = err.payload as { body?: { details?: { issue?: string }[] } };
  return payload.body?.details?.[0]?.issue ?? "";
}

/** A readable message for the customer page from any SDK failure. */
function explain(err: unknown): Error {
  if (err instanceof PaypalError) {
    if (err.kind === "api") {
      const payload = err.payload as { body?: { message?: string; details?: { description?: string }[] } };
      return new Error(`PayPal ${err.status}: ${payload.body?.details?.[0]?.description ?? payload.body?.message ?? err.message}`);
    }
    return new Error(`PayPal ${err.kind} error: ${err.message}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

function approveLink(order: Order): string | undefined {
  return order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
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
    const order = await paypalSdk().orders.getOrder({ id: offer.paypalOrderId }).catch(() => null);
    const href = order && approveLink(order);
    if (href) return { approveUrl: href, orderId: offer.paypalOrderId };
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
    // Close the check-then-insert race: two customers can pass checkSlot before either hold lands.
    // Re-read after our insert; if an overlapping confirmed booking or an earlier live hold exists, we lose and back out.
    const [mine] = await db.select().from(t.bookings).where(eq(t.bookings.id, holdId));
    const key = (b: { createdAt: string; id: string }) => `${b.createdAt}|${b.id}`;
    const s = Date.parse(offer.startAt), e = Date.parse(offer.endAt);
    const rival = (await activeBookings()).find(
      (b) => b.id !== holdId && b.photographerId === offer.photographerId && Date.parse(b.startAt) < e && Date.parse(b.endAt) > s &&
        (b.status === "confirmed" || !mine || key(b) < key(mine)),
    );
    if (rival) {
      await db.delete(t.bookings).where(eq(t.bookings.id, holdId));
      throw new Error("This time is no longer available: another customer is checking out for it right now.");
    }
  }

  const value = (offer.depositCents / 100).toFixed(2);
  let order: Order;
  try {
    order = await paypalSdk().orders.createOrder({
      payPalRequestId: `dc-${offer.id}-${holdExpiresAt}`,
      prefer: "return=representation",
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [
          {
            referenceId: offer.id,
            customId: offer.id,
            invoiceId: `${offer.id}-${Date.now()}`,
            description: `Deposit: ${svc.name}, ${fmtSlot(offer.startAt, offer.endAt)}`.slice(0, 127),
            softDescriptor: "LUMEN CO PHOTO",
            amount: { currencyCode: "USD", value },
          },
        ],
        paymentSource: {
          paypal: {
            experienceContext: {
              brandName: "Lumen & Co. Photography",
              userAction: PayPalExperienceUserAction.PayNow,
              shippingPreference: PayPalWalletContextShippingPreference.NoShipping,
              returnUrl: `${origin}/offer/${token}?paypal=return`,
              cancelUrl: `${origin}/offer/${token}?paypal=cancel`,
            },
          },
        },
      },
    });
  } catch (e) {
    throw explain(e);
  }
  if (!order.id) throw new Error("PayPal did not return an order id.");
  await db.update(t.offers).set({ status: "checkout", paypalOrderId: order.id, updatedAt: now() }).where(eq(t.offers.id, offer.id));
  await logActivity(inv.campaignId, "checkout", `${ct?.name} started PayPal checkout for ${money(offer.depositCents)} (order ${order.id}); slot held ${HOLD_MINUTES} min.`);
  await db.update(t.campaigns).set({ status: "awaiting_payment", updatedAt: now() }).where(eq(t.campaigns.id, inv.campaignId));
  const approveUrl = approveLink(order);
  if (!approveUrl) throw new Error("PayPal did not return an approval link.");
  return { approveUrl, orderId: order.id };
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

  let cap: Order;
  try {
    // An empty body makes the SDK send Content-Type: application/json; PayPal answers 415 without it.
    cap = await paypalSdk().orders.captureOrder({ id: orderId, payPalRequestId: `dc-cap-${orderId}`, prefer: "return=representation", body: {} });
  } catch (e) {
    // Already captured (a repeat return), or the answer was lost in transit: re-read the order before deciding.
    const lost = e instanceof PaypalError && (e.kind === "connection" || e.kind === "timeout" || e.kind === "decode");
    if (issueOf(e) === "ORDER_ALREADY_CAPTURED" || lost) {
      try {
        cap = await paypalSdk().orders.getOrder({ id: orderId });
      } catch (e2) {
        throw explain(lost ? e : e2);
      }
    } else throw explain(e);
  }
  const capture = cap.purchaseUnits?.[0]?.payments?.captures?.[0];
  if (cap.status !== "COMPLETED" || !capture?.id || capture.status !== "COMPLETED") throw new Error(`PayPal capture not completed (status ${capture?.status ?? cap.status}).`);

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
  return { ok: true, bookingId, captureId: capture.id, amount: capture.amount?.value ?? (offer.depositCents / 100).toFixed(2) };
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
