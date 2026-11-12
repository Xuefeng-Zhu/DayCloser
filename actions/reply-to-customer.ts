import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { replyToCustomer } from "../server/daycloser/core.js";

export default defineAction({
  description:
    "Answer a customer without changing their offer (a question about the session, or a polite close when they decline). Set close=true when they are not interested; they are never contacted again for this opening.",
  schema: z.object({
    invitationId: z.string(),
    message: z.string().min(5),
    close: z.boolean().optional(),
  }),
  run: async (input) => replyToCustomer(input),
});
