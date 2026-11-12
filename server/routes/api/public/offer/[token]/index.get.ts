import { createError, defineEventHandler, getRouterParam } from "h3";

import { publicThread } from "../../../../../daycloser/core.js";
import { paypalConfigured } from "../../../../../daycloser/paypal.js";

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") ?? "";
  try {
    return { ...(await publicThread(token)), paypalReady: paypalConfigured() };
  } catch (e) {
    throw createError({ statusCode: 404, statusMessage: (e as Error).message });
  }
});
