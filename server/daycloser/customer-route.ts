import { HTTPError, type H3Event } from "h3";
import type { z } from "zod";

import { DomainError } from "./errors.js";
import { PayPalCheckoutError } from "./paypal.js";

export async function withCustomer<T>(
  event: H3Event,
  run: (token: string) => Promise<T>,
) {
  event.res.headers.set("Cache-Control", "private, no-store");
  event.res.headers.set("Referrer-Policy", "no-referrer");
  const token = event.req.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_.-]{32,2048})$/i)?.[1];
  if (!token)
    throw new HTTPError("A valid customer inbox link is required.", {
      status: 401,
    });
  try {
    return await run(token);
  } catch (error) {
    if (error instanceof DomainError || error instanceof PayPalCheckoutError) {
      throw new HTTPError(error.message, { status: error.statusCode });
    }
    throw error;
  }
}

export async function customerBody<T>(
  event: H3Event,
  schema: z.ZodType<T>,
): Promise<T> {
  const contentType = event.req.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim();
  if (contentType !== "application/json")
    throw new HTTPError("Send JSON.", { status: 415 });
  const declaredSize = Number(event.req.headers.get("content-length") ?? 0);
  if (declaredSize > 8192)
    throw new HTTPError("Request is too large.", { status: 413 });
  const reader = event.req.body?.getReader();
  if (!reader) throw new HTTPError("A JSON body is required.", { status: 400 });
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      throw new HTTPError("Request is too large.", { status: 413 });
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  try {
    return schema.parse(JSON.parse(body));
  } catch {
    throw new HTTPError("Invalid customer request.", { status: 400 });
  }
}
