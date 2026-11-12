import { assertBodySize, defineEventHandler, HTTPError, readRawBody } from "h3";

import {
  handlePayPalWebhook,
  PayPalCheckoutError,
} from "../../../daycloser/paypal.js";

export default defineEventHandler(async (event) => {
  const limit = 128 * 1024;
  assertBodySize(event, limit);
  const body = await readRawBody(event, false);
  if (!body?.length)
    throw new HTTPError({
      status: 400,
      message: "Missing PayPal webhook payload.",
    });
  if (body.byteLength > limit)
    throw new HTTPError({
      status: 413,
      message: "PayPal webhook payload is too large.",
    });
  try {
    await handlePayPalWebhook(body, event.req.headers);
    return { received: true };
  } catch (error) {
    if (error instanceof PayPalCheckoutError) {
      throw new HTTPError({ status: error.statusCode, message: error.message });
    }
    throw error;
  }
});
