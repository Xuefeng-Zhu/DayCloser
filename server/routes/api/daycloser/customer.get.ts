import { defineEventHandler } from "h3";

import { withCustomer } from "../../../daycloser/customer-route.js";
import { getPayPalCheckoutConfig } from "../../../daycloser/paypal.js";
import { readCustomer } from "../../../daycloser/repository.js";

export default defineEventHandler((event) =>
  withCustomer(event, async (token) => ({
    ...(await readCustomer(token)),
    paypalClientId: getPayPalCheckoutConfig().clientId,
  })),
);
