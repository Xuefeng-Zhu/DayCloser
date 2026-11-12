import { defineEventHandler } from "h3";
import { z } from "zod";

import {
  customerBody,
  withCustomer,
} from "../../../../daycloser/customer-route.js";
import { createDepositCheckout } from "../../../../daycloser/paypal.js";

const schema = z.object({ holdId: z.string().uuid() }).strict();

export default defineEventHandler((event) =>
  withCustomer(event, async (token) => {
    const { holdId } = await customerBody(event, schema);
    return createDepositCheckout(token, holdId);
  }),
);
