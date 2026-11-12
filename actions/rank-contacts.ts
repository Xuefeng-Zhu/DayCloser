import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { rankContacts } from "../server/daycloser/core.js";

export default defineAction({
  description:
    "Pick who to invite for a campaign's opening. Returns opted-in contacts only, ranked by fit (service, photographer history, preferred day and time, time since last session), each with reasons and notes for personalising the invitation. Contacts who did not opt in are excluded and must never be contacted.",
  schema: z.object({
    campaignId: z.string().describe("Campaign id from sell-opening"),
    limit: z.coerce.number().int().min(1).max(6).default(3).describe("How many candidates to return; default 3"),
  }),
  readOnly: true,
  run: async ({ campaignId, limit }) => rankContacts(campaignId, limit),
});
