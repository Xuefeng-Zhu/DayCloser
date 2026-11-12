import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { domainAction } from "../server/daycloser/action-errors.js";
import { merchantOnly, merchantStudio } from "../server/daycloser/merchant.js";
import { proposeCampaign } from "../server/daycloser/repository.js";

export default defineAction({
  ...merchantOnly,
  agentTool: true,
  description:
    "Propose a bounded headshot campaign for the opening selected on the schedule.",
  schema: z.object({
    openingId: z
      .string()
      .min(1)
      .max(180)
      .describe("Opening ID from the studio schedule"),
  }),
  run: ({ openingId }, ctx) =>
    domainAction(() => proposeCampaign(merchantStudio(ctx, true), openingId)),
});
