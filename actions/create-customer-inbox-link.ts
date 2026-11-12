import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { domainAction } from "../server/daycloser/action-errors.js";
import { merchantOnly, merchantStudio } from "../server/daycloser/merchant.js";
import { createCustomerInboxToken } from "../server/daycloser/repository.js";

export default defineAction({
  ...merchantOnly,
  description:
    "Create a scoped inbox link for a customer in the studio's demo campaign.",
  schema: z.object({
    conversationId: z.string().uuid().describe("Customer conversation ID"),
  }),
  persistInBrowser: false,
  persistInChatHistory: false,
  run: ({ conversationId }, ctx) =>
    domainAction(async () => {
      const token = await createCustomerInboxToken(
        merchantStudio(ctx),
        conversationId,
      );
      return { href: `/inbox#${encodeURIComponent(token)}` };
    }),
});
