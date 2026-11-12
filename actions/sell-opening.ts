import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { startCampaign } from "../server/daycloser/core.js";
import { installReplyAutomation } from "../server/daycloser/automation.js";

export default defineAction({
  description:
    "Sell this opening: start (or reuse) the campaign for one opening. Pass the opening's photographerId, startAt and endAt from list-openings. Then call rank-contacts with the returned campaignId.",
  schema: z.object({
    photographerId: z.string().describe("Photographer id of the opening, e.g. ph_maya"),
    startAt: z.string().describe("Opening start, ISO timestamp from list-openings"),
    endAt: z.string().describe("Opening end, ISO timestamp from list-openings"),
  }),
  run: async (input, ctx) => {
    const owner = ctx?.userEmail ?? "";
    const result = await startCampaign({ ...input, ownerEmail: owner });
    const automation = owner ? await installReplyAutomation(owner) : "skipped (no signed-in owner)";
    return { ...result, replyAutomation: automation };
  },
});
