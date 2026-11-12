import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { moveBooking } from "../server/daycloser/core.js";

export default defineAction({
  description: "Move a confirmed booking to another time and/or photographer (drag in the Scheduler). Rejected when it overlaps another booking or hold, leaves studio hours, or the photographer doesn't offer the service.",
  schema: z.object({ bookingId: z.string(), photographerId: z.string(), startAt: z.string() }),
  run: async (input) => moveBooking(input),
});
