import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { pendingReplies } from "../server/daycloser/core.js";

export default defineAction({
  description: "Customer replies the agent has not answered yet (invitation and campaign ids). Handle each with get-campaign, then revise-offer or reply-to-customer.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => pendingReplies(),
});
