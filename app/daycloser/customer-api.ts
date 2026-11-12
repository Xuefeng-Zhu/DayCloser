import { appPath } from "@agent-native/core/client/api-path";
import type { CustomerConversation } from "@shared/daycloser";

export type Inbox = CustomerConversation & { paypalClientId: string | null };

type CustomerOperation =
  | { route: "reply"; body: { body: string; requestId: string } }
  | { route: "accept"; body: { offerId: string } }
  | { route: "checkout"; body: { holdId: string } }
  | { route: "capture"; body: { holdId: string; orderId: string } };

export class CustomerApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function customerRequest<T>(
  token: string,
  operation?: CustomerOperation,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(
    appPath(`/api/daycloser/customer${operation ? `/${operation.route}` : ""}`),
    {
      method: operation ? "POST" : "GET",
      body: operation ? JSON.stringify(operation.body) : null,
      signal: signal ?? null,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(operation ? { "Content-Type": "application/json" } : {}),
      },
    },
  );
  if (response.ok) return response.json() as Promise<T>;
  const payload = await response.json().catch(() => null);
  const errorMessage = payload?.statusMessage ?? payload?.message;
  const message =
    response.status >= 500 || typeof errorMessage !== "string"
      ? "The studio couldn’t complete this request. Please try again."
      : errorMessage;
  throw new CustomerApiError(response.status, message);
}
