import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { domainAction } from "../server/daycloser/action-errors.js";
import { merchantOnly, merchantStudio } from "../server/daycloser/merchant.js";
import { approveCampaign } from "../server/daycloser/repository.js";
import { signalDayCloser } from "../server/daycloser/signals.js";

export default defineAction({
  ...merchantOnly,
  description: "Approve one version of the campaign policy and queue outreach.",
  schema: z.object({
    campaignId: z.string().uuid().describe("Campaign ID"),
    version: z
      .number()
      .int()
      .positive()
      .describe("Version of the policy reviewed by the merchant"),
  }),
  run: ({ campaignId, version }, ctx) =>
    domainAction(async () => {
      const campaign = await approveCampaign(
        merchantStudio(ctx),
        campaignId,
        version,
      );
      signalDayCloser("daycloser.campaign-approved");
      return campaign;
    }),
});
