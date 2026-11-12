import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listCampaigns } from "../server/daycloser/core.js";

export default defineAction({
  description: "All campaigns (one per opening DayCloser is selling or sold), newest first.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => listCampaigns(),
});
