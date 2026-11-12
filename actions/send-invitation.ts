import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { sendInvitation } from "../server/daycloser/core.js";

export default defineAction({
  description:
    "Send one opted-in contact a personalised invitation with a concrete, feasible offer (service + photographer + start time). The deposit and price come from the service; never mention a discount. The message should be 2–4 friendly sentences in the studio's voice, name the time and the deposit, and invite a reply. The customer sees it at the returned link with a PayPal deposit button.",
  schema: z.object({
    campaignId: z.string(),
    contactId: z.string().describe("Contact id from rank-contacts"),
    serviceId: z.enum(["svc_family", "svc_headshot"]),
    photographerId: z.string().optional().describe("Defaults to the opening's photographer"),
    startAt: z.string().describe("ISO start time inside the opening (from list-openings or find-slots)"),
    message: z.string().min(20).describe("The personalised invitation text the customer reads"),
    rationale: z.string().optional().describe("One line for the merchant: why this person and this offer"),
  }),
  run: async (input) => sendInvitation(input),
});
