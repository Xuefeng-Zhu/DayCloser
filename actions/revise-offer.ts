import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { domainAction } from "../server/daycloser/action-errors.js";
import { getSalesScope, jobTool } from "../server/daycloser/agent-scope.js";
import { refreshMerchantDashboard } from "../server/daycloser/merchant.js";
import { resolveArrivalTime } from "../server/daycloser/reply-time.js";
import {
  getCampaignOptions,
  getJobContext,
  reviseOffer,
  sendCustomerMessage,
} from "../server/daycloser/repository.js";

export default defineAction({
  ...jobTool,
  endsTurn: true,
  description:
    "Interpret a customer reply and send a feasible revised headshot offer. Include every stated constraint. The server checks the live catalog, available time, and service buffer before making an offer.",
  schema: z.object({
    arrivalTime: z
      .string()
      .max(24)
      .nullable()
      .describe(
        "The customer's earliest arrival as a local clock, for example 2:30, 1:15 PM, or 14:30. Preserve any explicit AM/PM. Use null if the reply gives no arrival time.",
      ),
    budgetCents: z
      .number()
      .int()
      .min(0)
      .max(100_000_000)
      .nullable()
      .describe(
        "Customer's maximum total price in USD cents. For 110 dollars use 11000. Omit if unspecified.",
      ),
    minimumPhotos: z
      .number()
      .int()
      .min(1)
      .max(100_000)
      .nullable()
      .describe(
        "Requested minimum count of edited photos. Omit if unspecified.",
      ),
    clarify: z
      .boolean()
      .optional()
      .describe(
        "True only when the customer needs to answer a clarifying question before an offer can be selected.",
      ),
    body: z
      .string()
      .trim()
      .min(1)
      .max(600)
      .describe(
        "A brief acknowledgement or clarifying question. Do not add prices, discounts, links or unverified terms.",
      ),
  }),
  run: (input, ctx) =>
    domainAction(async () => {
      const { job } = getSalesScope(ctx);
      const { studioId, campaignId } = job.payload;
      const { studio, campaign, message } = await getJobContext(job);
      const { arrivalTime, budgetCents, minimumPhotos, clarify, body } = input;
      const earliestStartAt = resolveArrivalTime(
        message?.body ?? "",
        arrivalTime,
        studio.demoDate,
        campaign.policy.opening,
      );
      const [option] = await getCampaignOptions(studioId, campaignId, {
        ...(earliestStartAt ? { earliestStartAt } : {}),
        ...(budgetCents !== null ? { budgetCents } : {}),
        ...(minimumPhotos !== null ? { minimumPhotos } : {}),
      });
      const result =
        option && !clarify
          ? await reviseOffer(job, {
              body,
              serviceId: option.service.id,
              startAt: option.startAt,
            })
          : await sendCustomerMessage(
              job,
              clarify
                ? body
                : "I couldn’t find a headshot option within the available time and the details you shared. Could any of those details change?",
            );
      refreshMerchantDashboard();
      return result;
    }),
});
