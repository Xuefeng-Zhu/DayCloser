import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { cancelBooking } from "../server/daycloser/core.js";

export default defineAction({
  description: "Cancel a booking (a customer cancelled). The freed time immediately shows as a cancellation opening that DayCloser can sell.",
  schema: z.object({ bookingId: z.string() }),
  run: async ({ bookingId }) => cancelBooking(bookingId),
});
