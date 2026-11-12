import { defineEventHandler } from "h3";
import { z } from "zod";

import {
  customerBody,
  withCustomer,
} from "../../../../daycloser/customer-route.js";
import { refreshMerchantDashboard } from "../../../../daycloser/merchant.js";
import { captureDeposit } from "../../../../daycloser/paypal.js";

const schema = z
  .object({
    holdId: z.string().uuid(),
    orderId: z.string().regex(/^[A-Z0-9]{1,36}$/),
  })
  .strict();

export default defineEventHandler((event) =>
  withCustomer(event, async (token) => {
    const { holdId, orderId } = await customerBody(event, schema);
    const result = await captureDeposit(token, holdId, orderId);
    refreshMerchantDashboard();
    return result;
  }),
);
