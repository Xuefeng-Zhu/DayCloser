import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { domainAction } from "../server/daycloser/action-errors.js";
import { merchantStudio } from "../server/daycloser/merchant.js";
import { listEligibleCustomers } from "../server/daycloser/repository.js";

export default defineAction({
  description:
    "Find studio customers who opted into relevant invitations and have no upcoming appointment.",
  schema: z.object({}),
  http: { method: "GET" },
  requiresAuth: true,
  mcpTool: false,
  toolCallable: false,
  run: (_input, ctx) =>
    domainAction(() => listEligibleCustomers(merchantStudio(ctx, true))),
});
