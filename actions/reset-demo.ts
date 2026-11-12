import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { resetDemo } from "../server/daycloser/seed.js";

export default defineAction({
  description: "Reset the studio to its seeded demo state (two photographers, two services, eight synthetic contacts, three days of bookings). Deletes all campaigns.",
  schema: z.object({}),
  run: async () => {
    await resetDemo();
    return { ok: true };
  },
});
