import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { schedule } from "../server/daycloser/core.js";

export default defineAction({
  description:
    "The merchant timeline shown in the Bryntum Scheduler: photographers (resources), bookings (confirmed, held for checkout, cancelled) and computed openings for the next three studio days.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => schedule(),
});
