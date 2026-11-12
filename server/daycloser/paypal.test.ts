import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { captureDeposit, reconcilePendingPayments } from "./paypal";

const fixtures = vi.hoisted(() => ({
  getCustomerPayment: vi.fn(),
  beginPaymentCapture: vi.fn(),
  listPendingPayments: vi.fn(),
  finalizePayment: vi.fn(),
  getOrder: vi.fn(),
  captureOrder: vi.fn(),
  refreshMerchantDashboard: vi.fn(),
  signalDayCloser: vi.fn(),
}));

vi.mock("./repository", () => ({
  getCustomerPayment: fixtures.getCustomerPayment,
  beginPaymentCapture: fixtures.beginPaymentCapture,
  listPendingPayments: fixtures.listPendingPayments,
  finalizePayment: fixtures.finalizePayment,
}));
vi.mock("./paypal-gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./paypal-gateway")>()),
  createPayPalGateway: () => fixtures,
}));
vi.mock("./merchant", () => ({
  refreshMerchantDashboard: fixtures.refreshMerchantDashboard,
}));
vi.mock("./signals", () => ({ signalDayCloser: fixtures.signalDayCloser }));

const orderId = "FIXTUREORDER";
const holdId = "fixture-hold";
const token = "fixture-token";
const attemptId = "fixture-attempt";
const merchantId = "FIXTUREMERCHANT";
const captureRequestId = "fixture-capture-operation";
const purchaseUnit = {
  referenceId: attemptId,
  payee: { merchantId },
  amount: { currencyCode: "USD", value: "30.00" },
};
const order = {
  id: orderId,
  intent: "CAPTURE",
  status: "APPROVED",
  purchaseUnits: [purchaseUnit],
};
const captured = {
  ...order,
  status: "COMPLETED",
  purchaseUnits: [
    {
      ...purchaseUnit,
      payments: {
        captures: [
          {
            id: "FIXTURECAPTURE",
            status: "COMPLETED",
            amount: purchaseUnit.amount,
          },
        ],
      },
    },
  ],
};

function payment(status = "created", captureStartedAt: Date | null = null) {
  return {
    attempt: {
      id: attemptId,
      orderId,
      payeeMerchantId: merchantId,
      status,
      captureRequestId,
      captureStartedAt,
    },
    hold: {
      snapshot: {
        depositCents: 3_000,
        currency: "USD",
        startAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      },
    },
  };
}

describe("PayPal checkout orchestration fixtures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("PAYPAL_CLIENT_ID", "fixture-client");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "fixture-secret");
    vi.stubEnv("PAYPAL_MERCHANT_ID", merchantId);
    fixtures.getCustomerPayment.mockResolvedValue(payment());
  });

  afterEach(() => vi.unstubAllEnvs());

  it("does not start capture when approval is absent or the reservation expires before the atomic claim", async () => {
    fixtures.getOrder.mockResolvedValueOnce({ ...order, status: "CREATED" });
    await expect(captureDeposit(token, holdId, orderId)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(fixtures.beginPaymentCapture).not.toHaveBeenCalled();
    expect(fixtures.captureOrder).not.toHaveBeenCalled();

    fixtures.getOrder.mockResolvedValueOnce(order);
    fixtures.beginPaymentCapture.mockRejectedValueOnce(
      new Error("Reservation expired"),
    );
    await expect(captureDeposit(token, holdId, orderId)).rejects.toThrow(
      "Reservation expired",
    );
    expect(fixtures.captureOrder).not.toHaveBeenCalled();
  });

  it("claims capture before calling PayPal and settles a lost answer from a later order lookup", async () => {
    const pending = payment("capture_pending", new Date());
    fixtures.getOrder.mockResolvedValueOnce(order);
    fixtures.beginPaymentCapture.mockResolvedValueOnce({
      ...pending,
      started: true,
    });
    fixtures.captureOrder.mockImplementationOnce(async () => {
      expect(fixtures.beginPaymentCapture).toHaveBeenCalledWith(
        token,
        holdId,
        orderId,
      );
      throw new Error("Fixture connection lost");
    });
    await expect(captureDeposit(token, holdId, orderId)).resolves.toEqual({
      status: "pending",
    });
    expect(fixtures.captureOrder).toHaveBeenCalledWith(
      orderId,
      captureRequestId,
    );
    expect(fixtures.finalizePayment).not.toHaveBeenCalled();

    fixtures.listPendingPayments.mockResolvedValue([pending]);
    fixtures.getOrder.mockResolvedValueOnce(captured);
    fixtures.finalizePayment.mockResolvedValueOnce({
      status: "booked",
      changed: true,
    });
    await reconcilePendingPayments();
    expect(fixtures.captureOrder).toHaveBeenCalledTimes(1);
    expect(fixtures.finalizePayment).toHaveBeenCalledWith(
      {
        orderId,
        captureId: "FIXTURECAPTURE",
        status: "COMPLETED",
        currency: "USD",
        amountCents: 3_000,
        merchantId,
        referenceId: attemptId,
      },
      undefined,
    );
    expect(fixtures.signalDayCloser).toHaveBeenCalledWith(
      "daycloser.payment-booked",
    );
  });

  it("allows only the callback that wins the capture claim to submit payment", async () => {
    const pending = payment("capture_pending", new Date());
    fixtures.getOrder.mockResolvedValue(order);
    fixtures.beginPaymentCapture
      .mockResolvedValueOnce({ ...pending, started: true })
      .mockResolvedValueOnce({ ...pending, started: false });
    fixtures.captureOrder.mockResolvedValueOnce(captured);
    fixtures.finalizePayment.mockResolvedValueOnce({
      status: "booked",
      changed: true,
    });

    const results = await Promise.all([
      captureDeposit(token, holdId, orderId),
      captureDeposit(token, holdId, orderId),
    ]);
    expect(results).toEqual(
      expect.arrayContaining([{ status: "booked" }, { status: "pending" }]),
    );
    expect(fixtures.captureOrder).toHaveBeenCalledTimes(1);
    expect(fixtures.signalDayCloser).toHaveBeenCalledTimes(1);
  });
});
