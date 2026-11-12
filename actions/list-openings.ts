import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { domainAction } from "../server/daycloser/action-errors.js";
import { merchantStudio } from "../server/daycloser/merchant.js";
import { listOpenings } from "../server/daycloser/repository.js";

export default defineAction({
  description:
    "Read currently available time windows in the merchant's studio schedule.",
  schema: z.object({}),
  http: { method: "GET" },
  requiresAuth: true,
  mcpTool: false,
  toolCallable: false,
  run: (_input, ctx) =>
    domainAction(() => listOpenings(merchantStudio(ctx, true))),
});
