import {
  CaptureStatus,
  OrderStatus,
  PaypalError,
  RefundStatus,
  type Order,
} from "paypal";
import { z } from "zod";

import { refreshMerchantDashboard } from "./merchant.js";
import {
  captureEvidence,
  createPayPalGateway,
  orderMatchesDeposit,
  verifyPayPalWebhook,
} from "./paypal-gateway.js";
import {
  beginPaymentCapture,
  bindPaymentOrder,
  finalizePayment,
  getCustomerPayment,
  getOrCreatePayment,
  getPaymentByOrder,
  getRefundRequiredPayment,
  listPendingPayments,
  markRefunded,
  markRefundPending,
} from "./repository.js";
import { signalDayCloser } from "./signals.js";

const CAPTURE_RETRY_WINDOW_MS = 5 * 60 * 60 * 1_000;
const CAPTURE_RETRY_DELAY_MS = 15_000;
const PENDING = { status: "pending" } as const;
type Payment = Awaited<ReturnType<typeof getOrCreatePayment>>;
type Gateway = ReturnType<typeof createPayPalGateway>;

export class PayPalCheckoutError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

let sharedGateway:
  | {
      clientId: string;
      clientSecret: string;
      merchantId: string;
      gateway: Gateway;
    }
  | undefined;

function configuration() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim(); // guard:allow-env-credential — deployment-level sandbox configuration for the single configured studio
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim(); // guard:allow-env-credential — deployment-level sandbox configuration for the single configured studio
  const merchantId = process.env.PAYPAL_MERCHANT_ID?.trim(); // guard:allow-env-credential — deployment-level sandbox configuration for the single configured studio
  if (!clientId || !clientSecret || !merchantId) return undefined;
  if (
    sharedGateway?.clientId !== clientId ||
    sharedGateway.clientSecret !== clientSecret ||
    sharedGateway.merchantId !== merchantId
  ) {
    sharedGateway = {
      clientId,
      clientSecret,
      merchantId,
      gateway: createPayPalGateway({ clientId, clientSecret }),
    };
  }
  return sharedGateway;
}

export function getPayPalCheckoutConfig() {
  return { clientId: configuration()?.clientId ?? null };
}

function requirePayPal() {
  const config = configuration();
  if (!config)
    throw new PayPalCheckoutError(
      503,
      "PayPal sandbox checkout is unavailable.",
    );
  return config;
}

function checkConfiguredMerchant(payment: Payment, merchantId: string) {
  if (payment.attempt.payeeMerchantId !== merchantId) {
    throw new PayPalCheckoutError(
      503,
      "This payment requires its original PayPal merchant.",
    );
  }
}

function depositFor({ attempt, hold }: Payment) {
  return {
    amountCents: hold.snapshot.depositCents,
    currency: hold.snapshot.currency,
    merchantId: attempt.payeeMerchantId,
    referenceId: attempt.id,
  };
}

const safePayPalErrorCodes = new Set([
  "AUTHENTICATION_FAILURE",
  "DUPLICATE_REQUEST_ID",
  "INSTRUMENT_DECLINED",
  "INTERNAL_SERVER_ERROR",
  "INVALID_REQUEST",
  "MAX_NUMBER_OF_PAYMENT_ATTEMPTS_EXCEEDED",
  "MISSING_REQUIRED_PARAMETER",
  "ORDER_ALREADY_CAPTURED",
  "ORDER_NOT_APPROVED",
  "PAYER_ACTION_REQUIRED",
  "PAYER_CANNOT_PAY",
  "PAYEE_ACCOUNT_RESTRICTED",
  "PAYMENT_DENIED",
  "PAYMENT_SOURCE_CANNOT_BE_USED",
  "PERMISSION_DENIED",
  "RESOURCE_NOT_FOUND",
  "TRANSACTION_REFUSED",
  "UNPROCESSABLE_ENTITY",
  "UNSUPPORTED_MEDIA_TYPE",
]);
const payPalErrorBody = z.object({
  name: z.string(),
  details: z.array(z.object({ issue: z.string() })).default([]),
});

function noteFailure(operation: string, error: unknown) {
  if (!(error instanceof PaypalError)) {
    console.warn(`[daycloser] PayPal ${operation} could not finish`);
    return;
  }
  if (error.kind === "api") {
    const payload = "body" in error.payload ? error.payload.body : undefined;
    const parsed = payPalErrorBody.safeParse(payload);
    const codes = parsed.success
      ? [parsed.data.name, ...parsed.data.details.map(({ issue }) => issue)]
      : [];
    console.warn(
      `[daycloser] PayPal ${operation} failed with HTTP ${error.status}`,
      ...new Set(codes.filter((code) => safePayPalErrorCodes.has(code))),
    );
    return;
  }
  if (error.kind === "decode") {
    console.warn(
      `[daycloser] PayPal ${operation} could not decode HTTP ${error.status}`,
    );
    return;
  }
  console.warn(`[daycloser] PayPal ${operation} ${error.kind} failure`);
}

export async function createDepositCheckout(token: string, holdId: string) {
  const { gateway, merchantId } = requirePayPal();
  const payment = await getOrCreatePayment(token, holdId, merchantId);
  checkConfiguredMerchant(payment, merchantId);
  if (payment.attempt.orderId) return { orderId: payment.attempt.orderId };

  const deposit = depositFor(payment);
  let order: Order;
  let orderId: string | undefined;
  try {
    order = await gateway.createOrder(deposit, payment.attempt.createRequestId);
    orderId = order.id;
    if (orderId && !orderMatchesDeposit(order, deposit)) {
      order = await gateway.getOrder(orderId);
    }
  } catch (error) {
    noteFailure("create order", error);
    throw new PayPalCheckoutError(
      502,
      "The PayPal order could not be started. Retry checkout.",
    );
  }
  if (
    !orderId ||
    order.id !== orderId ||
    !orderMatchesDeposit(order, deposit)
  ) {
    throw new PayPalCheckoutError(
      502,
      "The PayPal order could not be verified.",
    );
  }
  await bindPaymentOrder(payment.attempt.id, orderId);
  return { orderId };
}

function terminalStatus(payment: Payment) {
  switch (payment.attempt.status) {
    case "completed":
      return { status: "booked" } as const;
    case "declined":
      return { status: "declined" } as const;
    case "refund_required":
    case "refund_pending":
    case "refunded":
      return { status: "refund_required" } as const;
    default:
      return undefined;
  }
}

async function settleOrder(
  order: Order,
  orderId: string,
  event?: { eventId: string; captureId: string },
) {
  const evidence = captureEvidence(order, orderId, event?.captureId);
  if (!evidence) return PENDING;
  const status = evidence.status;
  if (status === CaptureStatus.Completed) {
    const result = await finalizePayment(
      { ...evidence, status: "COMPLETED" },
      event?.eventId,
    );
    if (result.changed) {
      if (result.status === "booked")
        signalDayCloser("daycloser.payment-booked");
      else refreshMerchantDashboard();
    }
    return { status: result.status };
  }
  if (
    status === CaptureStatus.Declined ||
    status === CaptureStatus.Failed ||
    status === "DENIED"
  ) {
    const result = await finalizePayment(
      { ...evidence, status: "DECLINED" },
      event?.eventId,
    );
    if (result.changed) refreshMerchantDashboard();
    return { status: result.status };
  }
  return PENDING;
}

async function readOrderForCapture(gateway: Gateway, orderId: string) {
  try {
    return await gateway.getOrder(orderId);
  } catch (error) {
    noteFailure("get order", error);
    throw new PayPalCheckoutError(
      502,
      "PayPal approval could not be verified. Please retry.",
    );
  }
}

function captureRequestWindowOpen(payment: Payment, waitMs = 0) {
  const startedAt = payment.attempt.captureStartedAt?.getTime();
  const now = Date.now();
  return (
    startedAt !== undefined &&
    now - startedAt >= waitMs &&
    now - startedAt < CAPTURE_RETRY_WINDOW_MS &&
    Date.parse(payment.hold.snapshot.startAt) > now
  );
}

async function submitCapture(
  gateway: Gateway,
  payment: Payment,
  orderId: string,
) {
  let result: Order;
  try {
    result = await gateway.captureOrder(
      orderId,
      payment.attempt.captureRequestId,
    );
  } catch (error) {
    noteFailure("capture", error);
    return PENDING;
  }
  return settleOrder(result, orderId);
}

export async function captureDeposit(
  token: string,
  holdId: string,
  orderId: string,
) {
  const { gateway, merchantId } = requirePayPal();
  const payment = await getCustomerPayment(token, holdId, orderId);
  checkConfiguredMerchant(payment, merchantId);
  const terminal = terminalStatus(payment);
  if (terminal) return terminal;

  const order = await readOrderForCapture(gateway, orderId);
  const hasCapture = order.purchaseUnits?.some(
    (unit) => unit.payments?.captures?.length,
  );
  if (hasCapture) return settleOrder(order, orderId);
  if (
    order.id !== orderId ||
    order.status !== OrderStatus.Approved ||
    !orderMatchesDeposit(order, depositFor(payment))
  ) {
    if (payment.attempt.status === "capture_pending") return PENDING;
    throw new PayPalCheckoutError(
      409,
      "PayPal has not verified approval for this deposit.",
    );
  }

  const pendingPayment = await beginPaymentCapture(token, holdId, orderId);
  const settled = terminalStatus(pendingPayment);
  if (settled) return settled;
  if (!pendingPayment.started) return PENDING;
  refreshMerchantDashboard();
  if (!captureRequestWindowOpen(pendingPayment)) return PENDING;
  return submitCapture(gateway, pendingPayment, orderId);
}

export async function reconcilePendingPayments() {
  const config = configuration();
  if (!config) return;
  const payments = await listPendingPayments();
  for (const payment of payments) {
    const { orderId } = payment.attempt;
    if (!orderId || payment.attempt.payeeMerchantId !== config.merchantId)
      continue;
    try {
      const order = await config.gateway.getOrder(orderId);
      if (
        order.purchaseUnits?.some((unit) => unit.payments?.captures?.length)
      ) {
        await settleOrder(order, orderId);
      } else if (
        order.id === orderId &&
        order.status === OrderStatus.Approved &&
        orderMatchesDeposit(order, depositFor(payment)) &&
        captureRequestWindowOpen(payment, CAPTURE_RETRY_DELAY_MS)
      ) {
        await submitCapture(config.gateway, payment, orderId);
      }
    } catch (error) {
      noteFailure("reconciliation", error);
    }
  }
}

export async function refundDeposit(studioId: string, attemptId: string) {
  const { gateway, merchantId } = requirePayPal();
  const payment = await getRefundRequiredPayment(studioId, attemptId);
  checkConfiguredMerchant(payment, merchantId);
  const { attempt } = payment;
  if (attempt.status === "refunded") return { status: "refunded" } as const;
  if (!attempt.captureId)
    throw new PayPalCheckoutError(
      409,
      "There is no verified capture to refund.",
    );

  let refund;
  try {
    refund = attempt.refundId
      ? await gateway.getRefund(attempt.refundId)
      : await gateway.refundCapture(attempt.captureId, attempt.refundRequestId);
  } catch (error) {
    noteFailure("refund", error);
    throw new PayPalCheckoutError(
      502,
      "The PayPal refund could not be verified. Retry to check it again.",
    );
  }
  if (!refund.id || (attempt.refundId && attempt.refundId !== refund.id)) {
    throw new PayPalCheckoutError(
      502,
      "PayPal did not return the expected refund.",
    );
  }
  if (refund.status === RefundStatus.Completed) {
    await markRefunded(attemptId, refund.id);
    refreshMerchantDashboard();
    return { status: "refunded" } as const;
  }
  if (refund.status === RefundStatus.Pending) {
    await markRefundPending(attemptId, refund.id);
    refreshMerchantDashboard();
    return { status: "refund_pending" } as const;
  }
  throw new PayPalCheckoutError(
    502,
    "PayPal did not complete the refund. Review it in the sandbox dashboard.",
  );
}

const webhookEvent = z.object({
  id: z.string().min(1).max(128),
  event_type: z.string(),
  resource: z
    .object({
      id: z.string().min(1).max(36),
      supplementary_data: z.object({
        related_ids: z.object({ order_id: z.string().min(1).max(36) }),
      }),
    })
    .optional(),
});

export async function handlePayPalWebhook(
  rawBody: Uint8Array,
  headers: Headers,
) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim(); // guard:allow-env-credential — deployment-level sandbox configuration for the single configured studio
  if (!webhookId)
    throw new PayPalCheckoutError(
      503,
      "PayPal webhook verification is unavailable.",
    );

  let verified: boolean;
  try {
    verified = await verifyPayPalWebhook(rawBody, headers, webhookId);
  } catch (error) {
    noteFailure("webhook verification", error);
    throw new PayPalCheckoutError(
      503,
      "PayPal webhook verification could not finish.",
    );
  }
  if (!verified)
    throw new PayPalCheckoutError(401, "Invalid PayPal webhook signature.");

  let payload: unknown;
  try {
    payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    );
  } catch {
    throw new PayPalCheckoutError(400, "Invalid PayPal webhook payload.");
  }
  const parsed = webhookEvent
    .pick({ id: true, event_type: true })
    .safeParse(payload);
  if (!parsed.success)
    throw new PayPalCheckoutError(400, "Invalid PayPal webhook event.");
  if (
    parsed.data.event_type !== "PAYMENT.CAPTURE.COMPLETED" &&
    parsed.data.event_type !== "PAYMENT.CAPTURE.DENIED"
  )
    return;

  const event = webhookEvent.safeParse(payload);
  if (!event.success || !event.data.resource) {
    throw new PayPalCheckoutError(400, "Missing PayPal capture or order ID.");
  }
  const captureId = event.data.resource.id;
  const orderId = event.data.resource.supplementary_data.related_ids.order_id;
  const payment = await getPaymentByOrder(orderId);
  if (!payment) return;

  const { gateway, merchantId } = requirePayPal();
  checkConfiguredMerchant(payment, merchantId);
  const order = await readOrderForCapture(gateway, orderId);
  const result = await settleOrder(order, orderId, {
    eventId: event.data.id,
    captureId,
  });
  if (result.status === "pending") {
    throw new PayPalCheckoutError(
      503,
      "PayPal capture details are not available yet.",
    );
  }
}
