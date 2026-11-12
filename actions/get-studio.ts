import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { studio } from "../server/daycloser/core.js";
import { money } from "../server/daycloser/time.js";

export default defineAction({
  description:
    "Studio facts: the two photographers (with the services each offers) and the two predefined services with fixed duration, price and deposit. DayCloser never invents services, prices or discounts.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const { photographers, services } = await studio();
    return {
      studio: "Lumen & Co. Photography (Pacific time, open 9:00–18:00)",
      photographers: photographers.map((p) => ({ id: p.id, name: p.name, specialty: p.specialty, serviceIds: p.serviceIds })),
      services: services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, price: money(s.priceCents), deposit: money(s.depositCents), description: s.description })),
    };
  },
});
