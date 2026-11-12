import { defineEventHandler } from "h3";
import { z } from "zod";

import {
  customerBody,
  withCustomer,
} from "../../../../daycloser/customer-route.js";
import { submitCustomerReply } from "../../../../daycloser/repository.js";
import { signalDayCloser } from "../../../../daycloser/signals.js";

const schema = z
  .object({
    body: z.string().trim().min(1).max(2000),
    requestId: z.string().uuid(),
  })
  .strict();

export default defineEventHandler((event) =>
  withCustomer(event, async (token) => {
    const { body, requestId } = await customerBody(event, schema);
    const reply = await submitCustomerReply(token, body, requestId);
    signalDayCloser("daycloser.customer-replied");
    return reply;
  }),
);
