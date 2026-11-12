import "@bryntum/scheduler/scheduler.css";
import "@bryntum/scheduler/svalbard-light.css";
import "@bryntum/scheduler/fontawesome/css/fontawesome.css";
import "@bryntum/scheduler/fontawesome/css/solid.css";

import { BryntumScheduler } from "@bryntum/scheduler-react";
import { useMemo, useRef } from "react";

export type SchedulePayload = {
  window: { startAt: string; endAt: string; days: string[] };
  resources: { id: string; name: string; specialty: string }[];
  bookings: { id: string; resourceId: string; name: string; service: string; startAt: string; endAt: string; status: string; source: string }[];
  openings: {
    id: string;
    photographerId: string;
    startAt: string;
    endAt: string;
    minutes: number;
    origin: "unbooked" | "cancellation";
    cancelledCustomer: string;
    label: string;
    campaignId: string;
    campaignStatus: string;
  }[];
};

type Props = {
  data: SchedulePayload;
  selectedId: string | null;
  onSelectOpening: (openingId: string) => void;
  onSelectBooking: (bookingId: string) => void;
  onMove: (bookingId: string, photographerId: string, startAt: Date) => void;
  onCancelBooking: (bookingId: string) => void;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The merchant's real resource timeline: photographers × three studio days, bookings plus sellable openings. */
export default function StudioScheduler({ data, selectedId, onSelectOpening, onSelectBooking, onMove, onCancelBooking }: Props) {
  const ref = useRef<any>(null);
  const handlers = useRef({ onSelectOpening, onSelectBooking, onMove, onCancelBooking });
  handlers.current = { onSelectOpening, onSelectBooking, onMove, onCancelBooking };

  const resources = useMemo(
    () => data.resources.map((r) => ({ id: r.id, name: r.name, specialty: r.specialty })),
    [data.resources],
  );

  const events = useMemo(() => {
    const bookings = data.bookings.map((b) => ({
      id: b.id,
      resourceId: b.resourceId,
      name: b.name,
      startDate: new Date(b.startAt),
      endDate: new Date(b.endAt),
      kind: b.status === "cancelled" ? "cancelled" : b.status === "held" ? "held" : "booking",
      service: b.service,
      source: b.source,
      draggable: b.status === "confirmed",
      resizable: false,
      eventColor: b.status === "cancelled" ? "gray" : b.status === "held" ? "orange" : b.source === "daycloser" ? "violet" : "blue",
      eventStyle: b.status === "cancelled" ? "traced" : b.source === "daycloser" || b.status === "held" ? "filled" : "tonal",
      cls: b.status === "cancelled" ? "dc-cancelled" : "",
    }));
    const openings = data.openings.map((o) => ({
      id: o.id,
      resourceId: o.photographerId,
      name: o.campaignId ? "Selling…" : "Open",
      startDate: new Date(o.startAt),
      endDate: new Date(o.endAt),
      kind: "opening",
      origin: o.origin,
      cancelledCustomer: o.cancelledCustomer,
      minutes: o.minutes,
      campaignStatus: o.campaignStatus,
      draggable: false,
      resizable: false,
      eventColor: o.campaignId ? "teal" : "green",
      eventStyle: "outlined",
      cls: `dc-opening${o.id === selectedId ? " dc-selected" : ""}`,
    }));
    return [...bookings, ...openings];
  }, [data.bookings, data.openings, selectedId]);

  const config = useMemo(
    () => ({
      startDate: new Date(data.window.startAt),
      endDate: new Date(data.window.endAt),
      timeZone: "America/Los_Angeles",
      viewPreset: {
        base: "hourAndDay",
        tickWidth: 64,
        headers: [
          { unit: "day", dateFormat: "ddd MMM D" },
          { unit: "hour", dateFormat: "h A" },
        ],
      },
      workingTime: { fromHour: 9, toHour: 18 },
      rowHeight: 78,
      barMargin: 6,
      resourceMargin: 6,
      allowOverlap: false,
      eventLayout: "none",
      zoomOnMouseWheel: false,
      zoomOnTimeAxisDoubleClick: false,
      createEventOnDblClick: false,
      columns: [
        {
          text: "Photographer",
          field: "name",
          width: 170,
          renderer: ({ record }: any) => ({
            children: [
              { tag: "div", className: "dc-res-name", text: record.name },
              { tag: "div", className: "dc-res-sub", text: record.specialty },
            ],
          }),
        },
      ],
      features: {
        eventEdit: false,
        eventDragCreate: false,
        eventResize: false,
        scheduleMenu: false,
        cellMenu: false,
        eventDrag: { constrainDragToTimeline: true, showExactDropPosition: true },
        eventTooltip: {
          template: ({ eventRecord }: any) => {
            const e = eventRecord;
            if (e.kind === "opening")
              return `<b>${e.origin === "cancellation" ? "Cancellation opening" : "Never-booked opening"}</b><br>${e.minutes} min free${e.cancelledCustomer ? `<br>Freed by ${esc(e.cancelledCustomer)}` : ""}<br>${e.campaignStatus ? `DayCloser: ${esc(e.campaignStatus)}` : "Click to sell this opening"}`;
            if (e.kind === "cancelled") return `<b>${esc(e.name)}</b> cancelled<br>${esc(e.service)}`;
            if (e.kind === "held") return `<b>${esc(e.name)}</b><br>Held during PayPal checkout`;
            return `<b>${esc(e.name)}</b><br>${esc(e.service)}${e.source === "daycloser" ? "<br>Booked by DayCloser, deposit paid" : ""}`;
          },
        },
        eventMenu: {
          items: {
            editEvent: false,
            deleteEvent: false,
            copyEvent: false,
            cutEvent: false,
            splitEvent: false,
            unassignEvent: false,
            cancelBooking: {
              text: "Customer cancelled",
              icon: "fa fa-ban",
              weight: 100,
              onItem: ({ eventRecord }: any) => handlers.current.onCancelBooking(String(eventRecord.id)),
            },
            sellOpening: {
              text: "Sell this opening",
              icon: "fa fa-bolt",
              weight: 90,
              onItem: ({ eventRecord }: any) => handlers.current.onSelectOpening(String(eventRecord.id)),
            },
          },
          processItems: ({ eventRecord, items }: any) => {
            if (eventRecord.kind !== "booking") items.cancelBooking = false;
            if (eventRecord.kind !== "opening") items.sellOpening = false;
          },
        },
        nonWorkingTime: true,
      },
      eventRenderer: ({ eventRecord, renderData }: any) => {
        const e = eventRecord;
        if (e.kind === "opening") {
          const tag = e.origin === "cancellation" ? "Cancellation" : "Never booked";
          return `<div class="dc-ev"><b>${e.campaignStatus ? "Selling" : "Open"} · ${e.minutes}m</b><span>${tag}</span></div>`;
        }
        if (e.kind === "cancelled") return `<div class="dc-ev"><b>Cancelled</b><span>${esc(e.name)}</span></div>`;
        if (e.kind === "held") return `<div class="dc-ev"><b>Held</b><span>${esc(e.name)}</span></div>`;
        return `<div class="dc-ev"><b>${esc(e.name)}</b><span>${esc(e.service)}</span></div>`;
      },
      listeners: {
        eventClick: ({ eventRecord }: any) => {
          if (eventRecord.kind === "opening") handlers.current.onSelectOpening(String(eventRecord.id));
          else handlers.current.onSelectBooking(String(eventRecord.id));
        },
        beforeEventDrag: ({ eventRecord }: any) => eventRecord.kind === "booking",
        eventDrop: ({ eventRecords, targetResourceRecord }: any) => {
          const r = eventRecords?.[0];
          if (!r) return;
          handlers.current.onMove(String(r.id), String(targetResourceRecord?.id ?? r.resourceId), r.startDate);
        },
      },
    }),
    [data.window.startAt, data.window.endAt],
  );

  return (
    <div className="dc-scheduler h-full w-full">
      <BryntumScheduler ref={ref} {...(config as any)} resources={resources} events={events} />
    </div>
  );
}
