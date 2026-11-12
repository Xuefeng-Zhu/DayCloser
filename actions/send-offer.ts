import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { domainAction } from "../server/daycloser/action-errors.js";
import { getSalesScope, jobTool } from "../server/daycloser/agent-scope.js";
import { refreshMerchantDashboard } from "../server/daycloser/merchant.js";
import {
  getCampaignOptions,
  sendOffer,
} from "../server/daycloser/repository.js";

export default defineAction({
  ...jobTool,
  endsTurn: true,
  description:
    "Invite an approved customer to the first feasible catalog offer in the studio's opening.",
  schema: z.object({
    customerId: z
      .string()
      .min(1)
      .max(180)
      .describe("Use the exact ID from the eligible audience."),
    body: z
      .string()
      .trim()
      .min(1)
      .max(600)
      .describe(
        "A short personal greeting. The server appends the exact offer terms.",
      ),
  }),
  run: (input, ctx) =>
    domainAction(async () => {
      const { job } = getSalesScope(ctx);
      const { studioId, campaignId } = job.payload;
      const [option] = await getCampaignOptions(studioId, campaignId);
      if (!option)
        fail("No approved service fits this opening.", {
          statusCode: 409,
          errorCode: "OPENING_UNAVAILABLE",
        });
      const result = await sendOffer(job, {
        ...input,
        serviceId: option.service.id,
        startAt: option.startAt,
      });
      refreshMerchantDashboard();
      return result;
    }),
});
