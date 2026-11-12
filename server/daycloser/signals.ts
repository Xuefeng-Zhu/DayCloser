import { emit, registerEvent } from "@agent-native/core/event-bus";
import { z } from "zod";

import { refreshMerchantDashboard } from "./merchant.js";

export const dayCloserEvents = [
  "daycloser.campaign-approved",
  "daycloser.customer-replied",
  "daycloser.campaign-resumed",
  "daycloser.payment-booked",
] as const;

for (const name of dayCloserEvents) {
  registerEvent({
    name,
    description: "Wake DayCloser's worker after a committed studio operation.",
    payloadSchema: z.object({}),
  });
}

export function signalDayCloser(event: (typeof dayCloserEvents)[number]) {
  refreshMerchantDashboard();
  emit(event, {});
}
