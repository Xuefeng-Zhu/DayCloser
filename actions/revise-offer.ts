import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { reviseOffer } from "../server/daycloser/core.js";

export default defineAction({
  description:
    "Adapt the offer to the customer's reply: replace their current offer with a new feasible version (different time, day, photographer, or the other predefined service) and send the reply message that explains it. The server re-checks feasibility and rejects anything that clashes; price and deposit always follow the service. Use find-slots first.",
  schema: z.object({
    invitationId: z.string(),
    serviceId: z.enum(["svc_family", "svc_headshot"]),
    photographerId: z.string(),
    startAt: z.string().describe("ISO start from find-slots"),
    message: z.string().min(10).describe("Reply to the customer, 1–3 sentences, acknowledging what they asked"),
    rationale: z.string().describe("One line for the merchant on what changed and why"),
  }),
  run: async (input) => reviseOffer(input),
});
