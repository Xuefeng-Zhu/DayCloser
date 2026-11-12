import { useEffect, useRef, useState } from "react";

import { customerRequest, CustomerApiError } from "./customer-api";
import { money } from "./format";

type CheckoutSession = {
  start: (
    options: { presentationMode: "auto" },
    order: Promise<{ orderId: string }>,
  ) => Promise<unknown>;
};

type PayPalSdk = {
  createInstance: (options: {
    clientId: string;
    components: ["paypal-payments"];
  }) => Promise<{
    findEligibleMethods: () => Promise<{
      isEligible: (method: "paypal") => boolean;
    }>;
    createPayPalOneTimePaymentSession: (handlers: {
      onApprove: (data: { orderId: string }) => Promise<void>;
      onCancel: () => void;
      onError: () => void;
    }) => Promise<CheckoutSession>;
  }>;
};

let loadingSdk: Promise<PayPalSdk> | undefined;

function loadPayPal() {
  const getSdk = () => (window as Window & { paypal?: PayPalSdk }).paypal;
  const existingSdk = getSdk();
  if (existingSdk) return Promise.resolve(existingSdk);
  loadingSdk ??= new Promise<PayPalSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.sandbox.paypal.com/web-sdk/v6/core";
    script.async = true;
    script.referrerPolicy = "no-referrer";
    const unavailable = () => {
      script.remove();
      reject(new Error("PayPal couldn’t load."));
    };
    const timeout = window.setTimeout(unavailable, 12_000);
    script.onload = () => {
      window.clearTimeout(timeout);
      const sdk = getSdk();
      if (sdk) resolve(sdk);
      else unavailable();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      unavailable();
    };
    document.head.append(script);
  }).catch((error: unknown) => {
    loadingSdk = undefined;
    throw error;
  });
  return loadingSdk;
}

export function PayPalCheckout({
  token,
  clientId,
  holdId,
  depositCents,
  onUpdate,
}: {
  token: string;
  clientId: string | null;
  holdId: string;
  depositCents: number;
  onUpdate: () => Promise<unknown>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [checkoutRequested, setCheckoutRequested] = useState(false);

  useEffect(() => {
    const container = host.current;
    if (!clientId || !checkoutRequested || !container) return;
    let active = true;
    let processing = false;
    const button = document.createElement("paypal-button");
    button.setAttribute(
      "aria-label",
      `Pay ${money(depositCents)} deposit with PayPal`,
    );

    async function setup() {
      if (!clientId || !container) return;
      try {
        const sdk = await loadPayPal();
        const instance = await sdk.createInstance({
          clientId,
          components: ["paypal-payments"],
        });
        const eligibility = await instance.findEligibleMethods();
        if (!eligibility.isEligible("paypal")) {
          throw new Error("PayPal is unavailable for this browser.");
        }

        const session = await instance.createPayPalOneTimePaymentSession({
          onApprove: async ({ orderId }) => {
            try {
              const result = await customerRequest<{
                status: "booked" | "pending" | "declined" | "refund_required";
              }>(token, {
                route: "capture",
                body: { holdId, orderId },
              });
              if (active && result.status === "declined")
                setMessage("PayPal declined the payment.");
              await onUpdate();
            } catch (error) {
              if (active)
                setMessage(
                  error instanceof CustomerApiError
                    ? error.message
                    : "We couldn’t verify the deposit yet. Check the payment status.",
                );
              await onUpdate();
            } finally {
              finish();
            }
          },
          onCancel: () => {
            if (active) setMessage("PayPal checkout was canceled.");
            finish();
          },
          onError: () => {
            if (active)
              setMessage(
                "PayPal couldn’t complete checkout. Check your hold status and try again.",
              );
            void onUpdate();
            finish();
          },
        });
        if (!active) return;
        button.addEventListener("click", () => {
          if (processing) return;
          processing = true;
          setBusy(true);
          setMessage(undefined);
          // Start the PayPal session in the same click task. Awaiting the order here would lose user activation.
          const order = customerRequest<{ orderId: string }>(token, {
            route: "checkout",
            body: { holdId },
          });
          void session
            .start({ presentationMode: "auto" }, order)
            .catch((error: unknown) => {
              if (active)
                setMessage(
                  error instanceof CustomerApiError
                    ? error.message
                    : "PayPal couldn’t start checkout. Try again.",
                );
              void onUpdate();
              finish();
            });
        });
        container.append(button);
        setStatus("ready");
      } catch (error) {
        if (active) {
          setStatus("unavailable");
          setMessage(
            error instanceof Error &&
              error.message === "PayPal is unavailable for this browser."
              ? error.message
              : "PayPal couldn’t load. Please try again.",
          );
        }
      }
    }

    function finish() {
      processing = false;
      if (active) setBusy(false);
    }

    void setup();
    return () => {
      active = false;
      button.remove();
    };
  }, [
    attempt,
    checkoutRequested,
    clientId,
    depositCents,
    holdId,
    onUpdate,
    token,
  ]);

  if (!clientId)
    return (
      <p className="dc-inline-error" role="status">
        PayPal sandbox checkout is unavailable.
      </p>
    );
  if (!checkoutRequested) {
    return (
      <button
        type="button"
        className="dc-button dc-button-primary dc-button-full"
        onClick={() => setCheckoutRequested(true)}
      >
        Pay {money(depositCents)} deposit
      </button>
    );
  }
  return (
    <div className="dc-paypal">
      {status === "loading" && <p role="status">Opening PayPal sandbox…</p>}
      {status === "ready" && (
        <p>Complete your {money(depositCents)} deposit in PayPal Sandbox.</p>
      )}
      <div ref={host} className="dc-paypal-button" aria-busy={busy} />
      {busy && <p role="status">PayPal checkout in progress…</p>}
      {message && (
        <p className="dc-inline-error" role="alert">
          {message}
        </p>
      )}
      {status === "unavailable" && (
        <button
          type="button"
          className="dc-button dc-button-secondary"
          onClick={() => {
            setStatus("loading");
            setMessage(undefined);
            setAttempt((value) => value + 1);
          }}
        >
          Retry PayPal
        </button>
      )}
    </div>
  );
}
