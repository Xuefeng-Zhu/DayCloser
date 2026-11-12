import { createPublicKey, verify } from "node:crypto";
import { crc32 } from "node:zlib";

import {
  CheckoutPaymentIntent,
  PayPalWalletContextShippingPreference,
  PaypalClient,
  type Order,
} from "paypal";

const PAYPAL_SANDBOX_API = "https://api-m.sandbox.paypal.com";
const REPRESENTATION = "return=representation";
const CERTIFICATE_TTL = 60 * 60 * 1_000;
const CERTIFICATE_CACHE_LIMIT = 8;
const CERTIFICATE_HOSTS = new Set([
  "api-m.sandbox.paypal.com",
  "api.sandbox.paypal.com",
]);
const certificateCache = new Map<
  string,
  { key: ReturnType<typeof createPublicKey>; expiresAt: number }
>();

export type PayPalCredentials = { clientId: string; clientSecret: string };
export type DepositOrder = {
  amountCents: number;
  currency: string;
  merchantId: string;
  referenceId: string;
};

function dollars(cents: number) {
  if (!Number.isSafeInteger(cents) || cents <= 0)
    throw new Error("Invalid deposit amount.");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function amountInCents(value: string | undefined) {
  if (!value || !/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function createPayPalGateway(
  credentials: PayPalCredentials,
  fetcher?: typeof fetch,
) {
  const client = new PaypalClient({
    serverOptions: { baseUrl: PAYPAL_SANDBOX_API },
    oauth2: credentials,
    retry: { timeout: 8_000, maxRetries: 0 },
    logging: { level: "off" },
    fetch: fetcher,
  });

  const requestOptions = () => ({ signal: AbortSignal.timeout(12_000) });

  return {
    createOrder(deposit: DepositOrder, requestId: string) {
      return client.orders.createOrder(
        {
          payPalRequestId: requestId,
          prefer: REPRESENTATION,
          body: {
            intent: CheckoutPaymentIntent.Capture,
            purchaseUnits: [
              {
                referenceId: deposit.referenceId,
                customId: deposit.referenceId,
                description: "Northlight Studio booking deposit",
                amount: {
                  currencyCode: deposit.currency,
                  value: dollars(deposit.amountCents),
                },
              },
            ],
            paymentSource: {
              paypal: {
                experienceContext: {
                  shippingPreference:
                    PayPalWalletContextShippingPreference.NoShipping,
                },
              },
            },
          },
        },
        requestOptions(),
      );
    },
    getOrder(id: string) {
      return client.orders.getOrder({ id }, requestOptions());
    },
    captureOrder(id: string, requestId: string) {
      return client.orders.captureOrder(
        { id, payPalRequestId: requestId, prefer: REPRESENTATION, body: {} },
        requestOptions(),
      );
    },
    refundCapture(captureId: string, requestId: string) {
      return client.payments.refundCapturedPayment(
        {
          captureId,
          payPalRequestId: requestId,
          prefer: REPRESENTATION,
          body: {},
        },
        requestOptions(),
      );
    },
    getRefund(refundId: string) {
      return client.payments.getRefund({ refundId }, requestOptions());
    },
  };
}

export function orderMatchesDeposit(order: Order, deposit: DepositOrder) {
  const unit = order.purchaseUnits?.[0];
  return (
    order.intent === CheckoutPaymentIntent.Capture &&
    order.purchaseUnits?.length === 1 &&
    unit?.referenceId === deposit.referenceId &&
    unit?.payee?.merchantId === deposit.merchantId &&
    unit?.amount?.currencyCode === deposit.currency &&
    amountInCents(unit?.amount?.value) === deposit.amountCents
  );
}

export function captureEvidence(
  order: Order,
  expectedOrderId: string,
  expectedCaptureId?: string,
) {
  if (order.id !== expectedOrderId || order.purchaseUnits?.length !== 1)
    return undefined;
  const unit = order.purchaseUnits[0];
  if (!unit) return undefined;
  const captures = unit.payments?.captures;
  if (captures?.length !== 1) return undefined;
  const capture = captures[0];
  if (!capture?.id || (expectedCaptureId && capture.id !== expectedCaptureId))
    return undefined;
  const amountCents = amountInCents(capture.amount?.value);
  if (
    !capture.status ||
    amountCents === undefined ||
    !capture.amount?.currencyCode ||
    !unit.payee?.merchantId ||
    !unit.referenceId
  )
    return undefined;
  return {
    orderId: expectedOrderId,
    captureId: capture.id,
    status: capture.status,
    currency: capture.amount.currencyCode,
    amountCents,
    merchantId: unit.payee.merchantId,
    referenceId: unit.referenceId,
  };
}

async function getWebhookKey(url: URL, fetcher: typeof fetch) {
  const keyUrl = url.toString();
  const now = Date.now();
  const cached = certificateCache.get(keyUrl);
  if (cached && cached.expiresAt > now) return cached.key;
  const response = await fetcher(keyUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok)
    throw new Error("Could not retrieve PayPal webhook signing certificate.");
  const pem = await response.text();
  if (pem.length > 16_384)
    throw new Error("Invalid PayPal webhook signing certificate.");
  const key = createPublicKey(pem);
  if (certificateCache.size >= CERTIFICATE_CACHE_LIMIT) {
    const first = certificateCache.keys().next().value;
    if (first) certificateCache.delete(first);
  }
  certificateCache.set(keyUrl, { key, expiresAt: now + CERTIFICATE_TTL });
  return key;
}

export async function verifyPayPalWebhook(
  rawBody: Uint8Array,
  headers: Headers,
  webhookId: string,
  fetcher = fetch,
) {
  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionTime = headers.get("paypal-transmission-time");
  const signature = headers.get("paypal-transmission-sig");
  const algorithm = headers.get("paypal-auth-algo");
  const certificate = headers.get("paypal-cert-url");
  if (
    !transmissionId ||
    !transmissionTime ||
    !signature ||
    !certificate ||
    algorithm !== "SHA256withRSA" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)
  )
    return false;

  const url = URL.parse(certificate);
  if (
    !url ||
    url.protocol !== "https:" ||
    !CERTIFICATE_HOSTS.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/v1\/notifications\/certs\/[A-Za-z0-9-]+$/.test(url.pathname)
  )
    return false;

  const key = await getWebhookKey(url, fetcher);
  const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crc32(rawBody)}`;
  return verify(
    "RSA-SHA256",
    Buffer.from(message),
    key,
    Buffer.from(signature, "base64"),
  );
}
