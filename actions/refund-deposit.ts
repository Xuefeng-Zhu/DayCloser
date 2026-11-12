import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { domainAction } from "../server/daycloser/action-errors.js";
import {
  merchantOnly,
  merchantStudio,
  refreshMerchantDashboard,
} from "../server/daycloser/merchant.js";
import {
  PayPalCheckoutError,
  refundDeposit,
} from "../server/daycloser/paypal.js";

export default defineAction({
  ...merchantOnly,
  description:
    "Refund the captured deposit on a payment marked refund required.",
  schema: z.object({
    attemptId: z.string().uuid().describe("Payment attempt ID"),
  }),
  run: ({ attemptId }, ctx) =>
    domainAction(async () => {
      try {
        const result = await refundDeposit(merchantStudio(ctx), attemptId);
        refreshMerchantDashboard();
        return result;
      } catch (error) {
        if (error instanceof PayPalCheckoutError) {
          fail(error.message, {
            statusCode: error.statusCode,
            errorCode: "PAYPAL_REFUND_FAILED",
          });
        }
        throw error;
      }
    }),
});
