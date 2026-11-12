import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { domainAction } from "../server/daycloser/action-errors.js";
import {
  merchantOnly,
  merchantStudio,
  refreshMerchantDashboard,
} from "../server/daycloser/merchant.js";
import { setCampaignPaused } from "../server/daycloser/repository.js";
import { signalDayCloser } from "../server/daycloser/signals.js";

export default defineAction({
  ...merchantOnly,
  description:
    "Pause outreach or resume it within the approved campaign policy.",
  schema: z.object({
    campaignId: z.string().uuid().describe("Campaign ID"),
    paused: z.boolean().describe("True to pause outreach. False to resume."),
  }),
  run: ({ campaignId, paused }, ctx) =>
    domainAction(async () => {
      const campaign = await setCampaignPaused(
        merchantStudio(ctx),
        campaignId,
        paused,
      );
      if (paused) refreshMerchantDashboard();
      else signalDayCloser("daycloser.campaign-resumed");
      return campaign;
    }),
});
