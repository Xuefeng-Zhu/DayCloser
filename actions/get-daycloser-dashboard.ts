import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { merchantOnly, merchantStudio } from "../server/daycloser/merchant.js";
import {
  getMerchantDashboard,
  seedStudio,
} from "../server/daycloser/repository.js";

export default defineAction({
  ...merchantOnly,
  description:
    "Read the studio schedule, openings, campaigns, and deposit totals.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async (_input, ctx) => {
    const studioId = merchantStudio(ctx);
    // guard:allow-env-credential — Deployment-level synthetic seed settings.
    if (process.env.DAYCLOSER_DEMO_MODE === "1") {
      const demoDate = process.env.DAYCLOSER_DEMO_DATE?.trim(); // guard:allow-env-credential — Deployment-level synthetic seed settings.
      await seedStudio(studioId, demoDate ? { demoDate } : {});
    }
    return getMerchantDashboard(studioId);
  },
});
