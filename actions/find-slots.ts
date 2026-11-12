import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { findSlots } from "../server/daycloser/core.js";

export default defineAction({
  description:
    "Feasible start times for one of the two services, already checked against studio hours, the photographer's services, existing bookings and checkout holds. Use it before every offer, especially when a customer's reply asks for a different time, day, service or photographer.",
  schema: z.object({
    serviceId: z.enum(["svc_family", "svc_headshot"]).describe("svc_family (Family Mini Session, 60 min) or svc_headshot (Professional Headshot, 45 min)"),
    photographerId: z.string().optional().describe("Restrict to ph_maya or ph_jordan; omit for both"),
    day: z.string().optional().describe("Studio day as YYYY-MM-DD (Pacific); omit for all three days"),
    partOfDay: z.enum(["morning", "afternoon", "evening"]).optional().describe("morning <12:00, afternoon 12–16, evening 16–18"),
    limit: z.coerce.number().int().min(1).max(30).default(10),
  }),
  readOnly: true,
  run: async (input) => findSlots(input),
});
