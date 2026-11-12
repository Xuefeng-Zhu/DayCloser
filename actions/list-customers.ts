import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { customers } from "../server/daycloser/core.js";

export default defineAction({
  description:
    "The studio's customers as shown on the Customers page: opt-in consent, preferred service, photographer, days and times, last session, next booking, DayCloser outreach status, current offer and deposits paid.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => customers(),
});
