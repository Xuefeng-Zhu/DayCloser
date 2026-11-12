import { createError, defineEventHandler, getRequestURL, getRouterParam } from "h3";

import { startDepositCheckout } from "../../../../../daycloser/paypal.js";

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") ?? "";
  const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true });
  const origin = process.env.PUBLIC_APP_URL?.replace(/\/$/, "") || url.origin;
  try {
    return await startDepositCheckout(token, origin);
  } catch (e) {
    throw createError({ statusCode: 400, statusMessage: (e as Error).message });
  }
});
