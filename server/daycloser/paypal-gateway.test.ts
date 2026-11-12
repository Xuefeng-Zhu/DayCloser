import { generateKeyPairSync, sign } from "node:crypto";
import { crc32 } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  captureEvidence,
  createPayPalGateway,
  orderMatchesDeposit,
  verifyPayPalWebhook,
} from "./paypal-gateway";

// HTTP fixtures exercise the SDK serializer and decoder without contacting PayPal.
const deposit = {
  amountCents: 3_000,
  currency: "USD",
  merchantId: "TESTMERCHANT1",
  referenceId: "test-attempt",
};
const orderId = "TESTORDER1";
const captureId = "TESTCAPTURE1";
const refundId = "TESTREFUND1";
const orderFixture = {
  id: orderId,
  intent: "CAPTURE",
  status: "APPROVED",
  purchase_units: [
    {
      reference_id: deposit.referenceId,
      payee: { merchant_id: deposit.merchantId },
      amount: { currency_code: "USD", value: "30.00" },
    },
  ],
};
const capturedOrderFixture = {
  ...orderFixture,
  status: "COMPLETED",
  purchase_units: [
    {
      ...orderFixture.purchase_units[0],
      payments: {
        captures: [
          {
            id: captureId,
            status: "COMPLETED",
            amount: { currency_code: "USD", value: "30.00" },
          },
        ],
      },
    },
  ],
};

describe("PayPal sandbox adapter fixtures", () => {
  it("uses frozen cents, persists retry identity on the wire, and decodes canonical capture data", async () => {
    const calls: {
      path: string;
      method: string;
      headers: Headers;
      body: string;
    }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      const { pathname: path, origin } = new URL(request.url);
      expect(origin).toBe("https://api-m.sandbox.paypal.com");
      calls.push({
        path,
        method: request.method,
        headers: request.headers,
        body: await request.text(),
      });

      if (path === "/v1/oauth2/token") {
        return Response.json({
          access_token: "fixture-token",
          token_type: "Bearer",
          expires_in: 3_600,
        });
      }
      expect(request.headers.get("authorization")).toBe("Bearer fixture-token");
      if (path.endsWith("/capture")) return Response.json(capturedOrderFixture);
      if (path.endsWith("/refund") || path.endsWith(refundId)) {
        return Response.json({ id: refundId, status: "COMPLETED" });
      }
      return Response.json(orderFixture);
    };

    const gateway = createPayPalGateway(
      { clientId: "fixture-id", clientSecret: "fixture-secret" },
      fetcher,
    );
    const createRequestId = "30d87767-2f17-47b7-b710-77b72d2b2225";
    const captureRequestId = "18182959-4da8-4f0e-89f3-d6dcd40b597a";
    const refundRequestId = "dfe09821-2a16-4bd9-9d69-9a436a872c2a";
    const order = await gateway.createOrder(deposit, createRequestId);
    expect(orderMatchesDeposit(order, deposit)).toBe(true);
    expect(
      orderMatchesDeposit(order, { ...deposit, merchantId: "OTHERSELLER" }),
    ).toBe(false);
    expect(captureEvidence(order, orderId)).toBeUndefined();

    await gateway.createOrder(deposit, createRequestId);
    expect(await gateway.getOrder(orderId)).toEqual(order);
    const capture = await gateway.captureOrder(orderId, captureRequestId);
    expect(captureEvidence(capture, orderId, captureId)).toEqual({
      orderId,
      captureId,
      status: "COMPLETED",
      currency: "USD",
      amountCents: 3_000,
      merchantId: deposit.merchantId,
      referenceId: deposit.referenceId,
    });
    expect(captureEvidence(capture, "OTHERORDER")).toBeUndefined();
    expect(captureEvidence(capture, orderId, "OTHERCAPTURE")).toBeUndefined();
    expect(
      await gateway.refundCapture(captureId, refundRequestId),
    ).toMatchObject({ id: refundId, status: "COMPLETED" });
    expect(await gateway.getRefund(refundId)).toMatchObject({
      id: refundId,
      status: "COMPLETED",
    });

    const createCalls = calls.filter(
      (call) => call.path === "/v2/checkout/orders",
    );
    expect(createCalls).toHaveLength(2);
    for (const call of createCalls) {
      expect(call.headers.get("paypal-request-id")).toBe(createRequestId);
      expect(call.headers.get("prefer")).toBe("return=representation");
      expect(JSON.parse(call.body)).toMatchObject({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: deposit.referenceId,
            custom_id: deposit.referenceId,
            amount: { currency_code: "USD", value: "30.00" },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: { shipping_preference: "NO_SHIPPING" },
          },
        },
      });
    }
    const captureCall = calls.find((call) => call.path.endsWith("/capture"));
    expect(captureCall).toMatchObject({ method: "POST", body: "{}" });
    expect(captureCall?.headers.get("content-type")).toBe("application/json");
    expect(captureCall?.headers.get("paypal-request-id")).toBe(
      captureRequestId,
    );
    expect(
      calls
        .find((call) => call.path.endsWith("/refund"))
        ?.headers.get("paypal-request-id"),
    ).toBe(refundRequestId);
    expect(
      calls.filter((call) => call.path === "/v1/oauth2/token"),
    ).toHaveLength(1);
  });

  it("verifies an unmodified webhook body and rejects untrusted certificate locations", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const webhookId = "fixture-webhook";
    const body = Buffer.from('{ "id": "fixture-event" }');
    const transmissionId = "fixture-transmission";
    const transmissionTime = "2026-11-11T22:00:00Z";
    const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crc32(body)}`;
    const signature = sign(
      "RSA-SHA256",
      Buffer.from(message),
      privateKey,
    ).toString("base64");
    const certificateUrl =
      "https://api.sandbox.paypal.com/v1/notifications/certs/FIXTURE";
    const headers = new Headers({
      "PayPal-Transmission-Id": transmissionId,
      "PayPal-Transmission-Time": transmissionTime,
      "PayPal-Transmission-Sig": signature,
      "PayPal-Auth-Algo": "SHA256withRSA",
      "PayPal-Cert-Url": certificateUrl,
    });
    let requests = 0;
    const fetcher: typeof fetch = async (input, init) => {
      requests += 1;
      expect(input).toBe(certificateUrl);
      expect(init?.redirect).toBe("error");
      return new Response(
        publicKey.export({ type: "spki", format: "pem" }).toString(),
      );
    };

    await expect(
      verifyPayPalWebhook(body, headers, webhookId, fetcher),
    ).resolves.toBe(true);
    await expect(
      verifyPayPalWebhook(
        Buffer.from('{"id":"fixture-event"}'),
        headers,
        webhookId,
        fetcher,
      ),
    ).resolves.toBe(false);
    await expect(
      verifyPayPalWebhook(body, headers, "other-webhook", fetcher),
    ).resolves.toBe(false);
    headers.set(
      "PayPal-Cert-Url",
      "https://api.sandbox.paypal.com.example.org/v1/notifications/certs/FIXTURE",
    );
    await expect(
      verifyPayPalWebhook(body, headers, webhookId, fetcher),
    ).resolves.toBe(false);
    expect(requests).toBe(1);
  });
});
