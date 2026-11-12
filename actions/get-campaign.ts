import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { campaignDetail } from "../server/daycloser/core.js";

export default defineAction({
  description:
    "Full state of one campaign: the opening, every invited contact with their conversation, every offer version (current one marked by status), needsAgent flags for unanswered customer replies, and the activity log.",
  schema: z.object({ campaignId: z.string() }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ campaignId }) => campaignDetail(campaignId),
});
