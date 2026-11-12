import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { captureDeposit } from "../../../../../daycloser/paypal.js";

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") ?? "";
  const body = (await readBody(event)) as { orderId?: string };
  try {
    return await captureDeposit(token, String(body?.orderId ?? ""));
  } catch (e) {
    throw createError({ statusCode: 400, statusMessage: (e as Error).message });
  }
});
