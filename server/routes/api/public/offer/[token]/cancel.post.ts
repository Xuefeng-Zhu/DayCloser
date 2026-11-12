import { defineEventHandler, getRouterParam } from "h3";

import { cancelCheckout } from "../../../../../daycloser/paypal.js";

export default defineEventHandler(async (event) => cancelCheckout(getRouterParam(event, "token") ?? ""));
