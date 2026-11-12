import { defineEventHandler } from "h3";
import { z } from "zod";

import {
  customerBody,
  withCustomer,
} from "../../../../daycloser/customer-route.js";
import { refreshMerchantDashboard } from "../../../../daycloser/merchant.js";
import { acceptOffer } from "../../../../daycloser/repository.js";

const schema = z.object({ offerId: z.string().uuid() }).strict();

export default defineEventHandler((event) =>
  withCustomer(event, async (token) => {
    const { offerId } = await customerBody(event, schema);
    const hold = await acceptOffer(token, offerId);
    refreshMerchantDashboard();
    return hold;
  }),
);
