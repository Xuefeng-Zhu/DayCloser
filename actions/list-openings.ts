import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { computeOpenings } from "../server/daycloser/core.js";

export default defineAction({
  description:
    "Unused capacity: every open gap (at least one service long) in either photographer's working hours over the next three studio days. origin is 'cancellation' when a cancelled booking created it, else 'unbooked'. campaignId is set when DayCloser is already selling it.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => computeOpenings(),
});
