import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, type Database } from "../db/index.js";
import * as tables from "../db/schema.js";
import { overlaps, studioDateTime } from "./availability.js";
import { DomainError } from "./errors.js";
import {
  authorizeCustomer,
  insertMessage,
  lockStudio,
  readSchedule,
  recordActivity,
  type HoldRow,
  type PaymentAttempt,
} from "./storage.js";

export type { PaymentAttempt } from "./storage.js";
export type PaymentContext = { attempt: PaymentAttempt; hold: HoldRow };

async function getHold(db: Database, holdId: string, conversationId?: string) {
  const [hold] = await db
    .select()
    .from(tables.holds)
    .where(
      and(
        eq(tables.holds.id, holdId),
        conversationId ? eq(tables.holds.conversationId, conversationId) : undefined,
      ),
    );
  if (!hold) throw new DomainError(404, "Hold not found.");
  return hold;
}

async function getContext(db: Database, attemptId: string): Promise<PaymentContext | undefined> {
  const [context] = await db
    .select({ attempt: tables.payments, hold: tables.holds })
    .from(tables.payments)
    .innerJoin(tables.holds, eq(tables.payments.holdId, tables.holds.id))
    .where(eq(tables.payments.id, attemptId));
  return context;
}

export async function getOrCreatePayment(
  token: string,
  holdId: string,
  payeeMerchantId: string,
  clock?: Date,
): Promise<PaymentContext> {
  const db = getDb();
  const initial = await authorizeCustomer(db, token);
  return db.transaction(async (tx) => {
    await lockStudio(tx, initial.studio.id);
    const owner = await authorizeCustomer(tx, token);
    const hold = await getHold(tx, holdId, owner.conversation.id);
    const now = clock ?? new Date();
    if (
      hold.status !== "held" ||
      hold.expiresAt <= now ||
      Date.parse(hold.snapshot.startAt) <= +now
    ) {
      throw new DomainError(409, "The hold is no longer available for checkout.");
    }
    const [prior] = await tx
      .select()
      .from(tables.payments)
      .where(eq(tables.payments.holdId, holdId));
    if (prior) {
      if (prior.payeeMerchantId !== payeeMerchantId)
        throw new DomainError(409, "The PayPal merchant for this hold has changed.");
      return { attempt: prior, hold };
    }
    if (!payeeMerchantId.trim())
      throw new DomainError(503, "PayPal sandbox merchant configuration is required.");
    const [attempt] = await tx
      .insert(tables.payments)
      .values({
        id: randomUUID(),
        studioId: owner.studio.id,
        holdId,
        payeeMerchantId,
        status: "creating",
        createRequestId: randomUUID(),
        captureRequestId: randomUUID(),
        refundRequestId: randomUUID(),
      })
      .returning();
    return { attempt: attempt!, hold };
  });
}

export async function bindPaymentOrder(attemptId: string, orderId: string) {
  const db = getDb();
  const initial = await getContext(db, attemptId);
  if (!initial) throw new DomainError(404, "Payment attempt not found.");
  return db.transaction(async (tx) => {
    await lockStudio(tx, initial.attempt.studioId);
    const context = await getContext(tx, attemptId);
    if (!context) throw new DomainError(404, "Payment attempt not found.");
    if (context.attempt.orderId === orderId) return context;
    if (context.attempt.status !== "creating" || context.attempt.orderId) {
      throw new DomainError(409, "This deposit is already bound to another PayPal order.");
    }
    const [attempt] = await tx
      .update(tables.payments)
      .set({ orderId, status: "created" })
      .where(eq(tables.payments.id, attemptId))
      .returning();
    return { ...context, attempt: attempt! };
  });
}

async function readCustomerPayment(db: Database, token: string, holdId: string, orderId: string) {
  const owner = await authorizeCustomer(db, token);
  const hold = await getHold(db, holdId, owner.conversation.id);
  const [attempt] = await db
    .select()
    .from(tables.payments)
    .where(
      and(
        eq(tables.payments.studioId, owner.studio.id),
        eq(tables.payments.holdId, holdId),
        eq(tables.payments.orderId, orderId),
      ),
    );
  if (!attempt) throw new DomainError(404, "PayPal order not found for this hold.");
  return { attempt, hold };
}

export function getCustomerPayment(token: string, holdId: string, orderId: string) {
  return readCustomerPayment(getDb(), token, holdId, orderId);
}

export async function beginPaymentCapture(
  token: string,
  holdId: string,
  orderId: string,
  clock?: Date,
): Promise<PaymentContext & { started: boolean }> {
  const db = getDb();
  const initial = await readCustomerPayment(db, token, holdId, orderId);
  return db.transaction(async (tx) => {
    await lockStudio(tx, initial.attempt.studioId);
    const context = await readCustomerPayment(tx, token, holdId, orderId);
    const now = clock ?? new Date();
    const { hold, attempt } = context;
    if (attempt.status === "capture_pending" || attempt.status === "completed")
      return { ...context, started: false };
    if (
      attempt.status !== "created" ||
      hold.status !== "held" ||
      hold.expiresAt <= now ||
      Date.parse(hold.snapshot.startAt) <= +now
    ) {
      throw new DomainError(409, "The hold expired or was replaced before payment capture.");
    }
    if (await hasSchedulingConflict(tx, hold, now)) {
      throw new DomainError(409, "This interval is no longer available for payment capture.");
    }
    const [pendingHold] = await tx
      .update(tables.holds)
      .set({ status: "capture_pending" })
      .where(eq(tables.holds.id, hold.id))
      .returning();
    const [pendingAttempt] = await tx
      .update(tables.payments)
      .set({ status: "capture_pending", captureStartedAt: now })
      .where(eq(tables.payments.id, attempt.id))
      .returning();
    await recordActivity(
      tx,
      attempt.studioId,
      hold.campaignId,
      "PayPal deposit capture started.",
      now,
    );
    return { attempt: pendingAttempt!, hold: pendingHold!, started: true };
  });
}

async function hasSchedulingConflict(db: Database, hold: HoldRow, now: Date) {
  const { appointments } = await readSchedule(db, hold.studioId, now);
  return appointments.some(
    (entry) =>
      entry.id !== hold.id &&
      entry.resourceId === hold.snapshot.resourceId &&
      overlaps(entry, hold.snapshot),
  );
}

export async function getPaymentByOrder(orderId: string): Promise<PaymentContext | undefined> {
  const [context] = await getDb()
    .select({ attempt: tables.payments, hold: tables.holds })
    .from(tables.payments)
    .innerJoin(tables.holds, eq(tables.payments.holdId, tables.holds.id))
    .where(eq(tables.payments.orderId, orderId));
  return context;
}

export function listPendingPayments(): Promise<PaymentContext[]> {
  return getDb()
    .select({ attempt: tables.payments, hold: tables.holds })
    .from(tables.payments)
    .innerJoin(tables.holds, eq(tables.payments.holdId, tables.holds.id))
    .where(eq(tables.payments.status, "capture_pending"))
    .orderBy(asc(tables.payments.captureStartedAt))
    .limit(25);
}

export type TrustedCapture = {
  orderId: string;
  captureId: string;
  status: string;
  currency: string;
  amountCents: number;
  merchantId: string;
  referenceId: string;
};

type CaptureResult = {
  status: "booked" | "refund_required" | "declined" | "pending";
  changed: boolean;
};

function captureResult(attempt: PaymentAttempt): CaptureResult {
  if (attempt.status === "completed") return { status: "booked", changed: false };
  if (attempt.status === "declined") return { status: "declined", changed: false };
  if (["refund_required", "refund_pending", "refunded"].includes(attempt.status))
    return { status: "refund_required", changed: false };
  return { status: "pending", changed: false };
}

export async function finalizePayment(
  capture: TrustedCapture,
  eventId?: string,
  clock?: Date,
): Promise<CaptureResult> {
  const initial = await getPaymentByOrder(capture.orderId);
  if (!initial) throw new DomainError(404, "No payment attempt matches the verified PayPal order.");
  return getDb().transaction(async (tx) => {
    const studio = await lockStudio(tx, initial.attempt.studioId);
    const context = await getContext(tx, initial.attempt.id);
    if (!context) throw new DomainError(404, "Payment attempt not found.");
    const { attempt, hold } = context;
    const now = clock ?? new Date();
    if (eventId) {
      const [newEvent] = await tx
        .insert(tables.webhookEvents)
        .values({
          id: eventId,
          attemptId: attempt.id,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: tables.webhookEvents.id });
      if (!newEvent) return captureResult(attempt);
    }
    const prior = captureResult(attempt);
    if (prior.status === "booked" || prior.status === "refund_required") return prior;
    const matches =
      capture.referenceId === attempt.id &&
      capture.merchantId === attempt.payeeMerchantId &&
      capture.amountCents === hold.snapshot.depositCents &&
      capture.currency === hold.snapshot.currency;
    if (capture.status === "DENIED" || capture.status === "DECLINED") {
      if (!matches || attempt.status !== "capture_pending") return prior;
      await tx
        .update(tables.payments)
        .set({ status: "declined", captureId: capture.captureId })
        .where(eq(tables.payments.id, attempt.id));
      await tx.update(tables.holds).set({ status: "expired" }).where(eq(tables.holds.id, hold.id));
      await tx
        .update(tables.offers)
        .set({ status: "expired" })
        .where(eq(tables.offers.id, hold.offerId));
      await recordActivity(
        tx,
        attempt.studioId,
        hold.campaignId,
        "PayPal declined the deposit. The hold was released.",
        now,
      );
      return { status: "declined", changed: true };
    }
    if (capture.status !== "COMPLETED") return prior;

    const [campaign] = await tx
      .select()
      .from(tables.campaigns)
      .where(eq(tables.campaigns.id, hold.campaignId));
    const allocates =
      matches &&
      attempt.status === "capture_pending" &&
      hold.status === "capture_pending" &&
      campaign?.status !== "completed" &&
      Date.parse(hold.snapshot.startAt) > +now &&
      !(await hasSchedulingConflict(tx, hold, now));
    await tx
      .update(tables.payments)
      .set({
        status: allocates ? "completed" : "refund_required",
        captureId: capture.captureId,
        capturedCurrency: capture.currency,
        capturedAmountCents: capture.amountCents,
      })
      .where(eq(tables.payments.id, attempt.id));
    await tx
      .update(tables.holds)
      .set({ status: allocates ? "booked" : "refund_required" })
      .where(eq(tables.holds.id, hold.id));
    if (!allocates) {
      await recordActivity(
        tx,
        attempt.studioId,
        hold.campaignId,
        "A completed PayPal capture requires a merchant refund. No booking was created.",
        now,
      );
      return { status: "refund_required", changed: true };
    }
    await tx
      .update(tables.campaigns)
      .set({ status: "completed" })
      .where(eq(tables.campaigns.id, hold.campaignId));
    const competing = await tx
      .select({ id: tables.conversations.id })
      .from(tables.conversations)
      .where(eq(tables.conversations.campaignId, hold.campaignId));
    await tx
      .update(tables.offers)
      .set({ status: "closed" })
      .where(
        and(
          inArray(
            tables.offers.conversationId,
            competing.map(({ id }) => id),
          ),
          eq(tables.offers.status, "offered"),
        ),
      );
    await insertMessage(tx, {
      id: randomUUID(),
      conversationId: hold.conversationId,
      requestId: "confirmation:" + hold.id,
      role: "system",
      body:
        "Deposit verified. Your " +
        hold.snapshot.serviceName +
        " is confirmed for " +
        studioDateTime(hold.snapshot.startAt, studio.timezone) +
        ".",
      offerId: hold.offerId,
      createdAt: now,
    });
    await recordActivity(
      tx,
      attempt.studioId,
      hold.campaignId,
      "Deposit verified. Booking confirmed and campaign completed.",
      now,
    );
    return { status: "booked", changed: true };
  });
}

export async function getRefundRequiredPayment(
  studioId: string,
  attemptId: string,
): Promise<PaymentContext> {
  const context = await getContext(getDb(), attemptId);
  if (context?.attempt.studioId !== studioId)
    throw new DomainError(404, "Refundable payment not found.");
  if (!["refund_required", "refund_pending", "refunded"].includes(context.attempt.status)) {
    throw new DomainError(409, "This payment is not in refund recovery.");
  }
  return context;
}

async function setRefundStatus(
  attemptId: string,
  refundId: string,
  status: "refund_pending" | "refunded",
) {
  const db = getDb();
  const initial = await getContext(db, attemptId);
  if (!initial) throw new DomainError(404, "Payment attempt not found.");
  return db.transaction(async (tx) => {
    await lockStudio(tx, initial.attempt.studioId);
    const context = await getContext(tx, attemptId);
    if (!context) throw new DomainError(404, "Payment attempt not found.");
    const { attempt, hold } = context;
    if (attempt.refundId && attempt.refundId !== refundId)
      throw new DomainError(409, "Refund identity does not match the recorded refund.");
    if (attempt.status === "refunded" || attempt.status === status) return context;
    if (!["refund_required", "refund_pending"].includes(attempt.status))
      throw new DomainError(409, "This payment is not in refund recovery.");
    const [updated] = await tx
      .update(tables.payments)
      .set({ status, refundId })
      .where(eq(tables.payments.id, attempt.id))
      .returning();
    const now = new Date();
    let resolvedHold = hold;
    if (status === "refunded") {
      const [refunded] = await tx
        .update(tables.holds)
        .set({ status: "refunded" })
        .where(eq(tables.holds.id, hold.id))
        .returning();
      resolvedHold = refunded!;
      await insertMessage(tx, {
        id: randomUUID(),
        conversationId: hold.conversationId,
        requestId: "refund:" + hold.id,
        role: "system",
        body: "Your PayPal deposit was refunded.",
        offerId: hold.offerId,
        createdAt: now,
      });
    }
    await recordActivity(
      tx,
      attempt.studioId,
      hold.campaignId,
      status === "refunded"
        ? "PayPal sandbox refund completed."
        : "PayPal sandbox refund is pending.",
      now,
    );
    return { attempt: updated!, hold: resolvedHold };
  });
}

export function markRefundPending(attemptId: string, refundId: string) {
  return setRefundStatus(attemptId, refundId, "refund_pending");
}

export function markRefunded(attemptId: string, refundId: string) {
  return setRefundStatus(attemptId, refundId, "refunded");
}
