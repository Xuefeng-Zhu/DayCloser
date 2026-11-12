import "./bryntum-theme";

import { BryntumCalendar } from "@bryntum/calendar-react";
import { useMemo, useRef } from "react";

import type { SchedulePayload } from "./StudioScheduler";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The same studio data as the timeline, as a Bryntum Calendar: day / week / agenda per photographer, with sellable openings and live offers. */
export default function StudioCalendar({ data, onSell }: { data: SchedulePayload; onSell: (openingId: string) => void }) {
  const handlers = useRef({ onSell });
  handlers.current = { onSell };

  const resources = useMemo(
    () => data.resources.map((r, i) => ({ id: r.id, name: r.name, eventColor: i === 0 ? "blue" : "indigo" })),
    [data.resources],
  );

  const events = useMemo(() => {
    const bookings = data.bookings
      .filter((b) => b.status !== "cancelled")
      .map((b) => ({
        id: b.id,
        resourceId: b.resourceId,
        name: b.status === "held" ? `Held: ${b.name}` : b.name,
        startDate: new Date(b.startAt),
        endDate: new Date(b.endAt),
        kind: b.status === "held" ? "held" : "booking",
        service: b.service,
        source: b.source,
        eventColor: b.status === "held" ? "orange" : b.source === "daycloser" ? "violet" : undefined,
        readOnly: true,
      }));
    const openings = data.openings.map((o) => ({
      id: o.id,
      resourceId: o.photographerId,
      name: o.campaignId ? `Selling · ${o.minutes}m` : `Open · ${o.minutes}m`,
      startDate: new Date(o.startAt),
      endDate: new Date(o.endAt),
      kind: "opening",
      origin: o.origin,
      cancelledCustomer: o.cancelledCustomer,
      campaignId: o.campaignId,
      eventColor: o.campaignId ? "teal" : "green",
      cls: "dc-cal-opening",
      readOnly: true,
    }));
    const offers = (data.offers ?? []).map((o) => ({
      id: o.id,
      resourceId: o.resourceId,
      name: `Offer v${o.version} · ${o.name}`,
      startDate: new Date(o.startAt),
      endDate: new Date(o.endAt),
      kind: "offer",
      service: o.service,
      offerStatus: o.status,
      eventColor: "violet",
      cls: "dc-cal-offer",
      readOnly: true,
    }));
    return [...bookings, ...openings, ...offers];
  }, [data.bookings, data.openings, data.offers]);

  const config = useMemo(
    () => ({
      date: new Date(data.window.startAt),
      timeZone: "America/Los_Angeles",
      mode: "week",
      readOnly: true,
      modes: {
        day: { dayStartTime: 8, dayEndTime: 19, hourHeight: 56 },
        week: { dayStartTime: 8, dayEndTime: 19, hourHeight: 46 },
        month: true,
        year: false,
        agenda: true,
      },
      sidebar: {
        items: {
          resourceFilter: { title: "Photographers" },
        },
      },
      features: {
        eventEdit: false,
        eventMenu: false,
        scheduleMenu: false,
        eventTooltip: {
          align: "l-r",
          tools: { edit: false, delete: false },
          renderer: ({ eventRecord }: any) => {
            const e = { ...(eventRecord.data ?? {}), name: eventRecord.name };
            if (e.kind === "opening")
              return `<b>${e.origin === "cancellation" ? "Cancellation opening" : "Never-booked opening"}</b>${e.cancelledCustomer ? `<br>Freed by ${esc(e.cancelledCustomer)}` : ""}<br>${e.campaignId ? "DayCloser is selling it" : "Click to sell this opening"}`;
            if (e.kind === "offer") return `<b>${esc(e.name)}</b><br>${esc(e.service)}<br>${e.offerStatus === "checkout" ? "Customer is in PayPal checkout" : "Waiting for the customer"}`;
            if (e.kind === "held") return `<b>${esc(e.name)}</b><br>Held during PayPal checkout`;
            return `<b>${esc(e.name)}</b><br>${esc(e.service)}${e.source === "daycloser" ? "<br>Booked by DayCloser, deposit paid" : ""}`;
          },
        },
      },
      listeners: {
        eventClick: ({ eventRecord }: any) => {
          if (eventRecord.data?.kind === "opening") handlers.current.onSell(String(eventRecord.id));
        },
      },
    }),
    [data.window.startAt],
  );

  return (
    <div className="dc-calendar h-full w-full">
      <BryntumCalendar {...(config as any)} resources={resources} events={events} />
    </div>
  );
}
