import type { EventModelConfig } from "@bryntum/scheduler-enterprise";
import { BryntumScheduler } from "@bryntum/scheduler-react-enterprise";
import type { BryntumSchedulerProps } from "@bryntum/scheduler-react-enterprise";
import type { MerchantDashboard } from "@shared/daycloser";
import { useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";

import { time } from "./format";

import "@bryntum/core-enterprise/fontawesome/css/fontawesome.css";
import "@bryntum/core-enterprise/fontawesome/css/solid.css";
import "@bryntum/scheduler-enterprise/scheduler.css";
import "@bryntum/scheduler-enterprise/svalbard.css";

const licenseKey = import.meta.env.VITE_BRYNTUM_LICENSE_KEY?.trim();
if (licenseKey) globalThis.bryntum.licenseKey = licenseKey;

export type SchedulerProps = {
  dashboard: MerchantDashboard;
  selectedOpeningId: string | null;
  onSelect: (openingId: string) => void;
};

const appearance: BryntumSchedulerProps = {
  ariaLabel: "Photographer schedule",
  viewPreset: {
    base: "hourAndDay",
    tickWidth: 82,
    headers: [{ unit: "hour", dateFormat: "h A" }],
  },
  autoAdjustTimeAxis: false,
  forceFit: false,
  rowHeight: 86,
  barMargin: 15,
  eventStyle: "filled",
  useInitialAnimation: false,
  readOnly: true,
  allowCreate: false,
  eventSelectionDisabled: true,
  enableDeleteKey: false,
  zoomOnMouseWheel: false,
  zoomOnTimeAxisDoubleClick: false,
  eventDragFeature: false,
  eventDragCreateFeature: false,
  eventResizeFeature: false,
  eventEditFeature: false,
  eventMenuFeature: false,
  eventTooltipFeature: false,
  eventCopyPasteFeature: false,
  cellEditFeature: false,
  columnLinesFeature: true,
  columnPickerFeature: false,
  headerMenuFeature: false,
  sortFeature: false,
  scheduleMenuFeature: false,
  timeAxisHeaderMenuFeature: false,
  columns: [
    {
      text: "Photographer",
      field: "name",
      width: 115,
      renderer: ({ value }: { value: unknown }) => ({
        tag: "strong",
        className: "font-medium",
        text: String(value),
      }),
    },
  ],
};

const openingIdPrefix = "opening:";
const statusNames = {
  appointment: "Appointment",
  held: "Hold",
  capture_pending: "Pending",
  booked: "Paid",
};

function scheduleEvents(
  dashboard: MerchantDashboard,
  selectedOpeningId: string | null,
): EventModelConfig[] {
  const events: EventModelConfig[] = dashboard.openings.map((opening) => ({
    id: `${openingIdPrefix}${opening.id}`,
    resourceId: opening.resourceId,
    startDate: opening.startAt,
    endDate: opening.endAt,
    name: opening.source === "cancellation" ? "Cancellation opening" : "Available",
    cls:
      opening.id === selectedOpeningId ? "dc-event-opening dc-event-selected" : "dc-event-opening",
  }));
  for (const appointment of dashboard.appointments) {
    events.push({
      id: `session:${appointment.id}`,
      resourceId: appointment.resourceId,
      startDate: appointment.startAt,
      endDate: appointment.shootingEndAt,
      name:
        appointment.status === "appointment" ? appointment.name : statusNames[appointment.status],
      cls: `dc-event-${appointment.status}`,
    });
    if (appointment.shootingEndAt < appointment.endAt) {
      events.push({
        id: `buffer:${appointment.id}`,
        resourceId: appointment.resourceId,
        startDate: appointment.shootingEndAt,
        endDate: appointment.endAt,
        name: "Buffer",
        cls: "dc-event-buffer",
      });
    }
  }
  return events;
}

export default function Scheduler({ dashboard, selectedOpeningId, onSelect }: SchedulerProps) {
  const scheduler = useRef<BryntumScheduler>(null);
  const { timezone } = dashboard.studio;
  const { resources } = dashboard;
  const schedulerResources = useMemo(
    () => resources.map(({ id, name }) => ({ id, name })),
    [resources],
  );
  const events = useMemo(
    () => scheduleEvents(dashboard, selectedOpeningId),
    [dashboard, selectedOpeningId],
  );
  const eventTimes = useMemo(
    () =>
      new Map(
        events.map((event) => [
          event.id,
          `${time(String(event.startDate), timezone)}–${time(String(event.endDate), timezone)}`,
        ]),
      ),
    [events, timezone],
  );
  const startDate = resources.reduce<string | undefined>(
    (earliest, resource) =>
      !earliest || resource.startAt < earliest ? resource.startAt : earliest,
    undefined,
  );
  const endDate = resources.reduce<string | undefined>(
    (latest, resource) => (!latest || resource.endAt > latest ? resource.endAt : latest),
    undefined,
  );

  if (!startDate || !endDate)
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">No photographers are scheduled.</p>
    );

  function selectEvent(id: string | number) {
    const key = String(id);
    if (key.startsWith(openingIdPrefix)) onSelect(key.slice(openingIdPrefix.length));
  }

  function selectFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const record = scheduler.current?.instance.resolveEventRecord(event.nativeEvent);
    if (!record || !String(record.id).startsWith(openingIdPrefix)) return;
    event.preventDefault();
    selectEvent(record.id);
  }

  return (
    <div className="h-56 min-w-0 [&>.b-scheduler]:h-full" onKeyDownCapture={selectFromKeyboard}>
      <BryntumScheduler
        ref={scheduler}
        {...appearance}
        timeZone={timezone}
        startDate={startDate}
        endDate={endDate}
        resources={schedulerResources}
        events={events}
        eventRenderer={({ eventRecord, renderData }) => {
          const windowLabel = eventTimes.get(eventRecord.id);
          renderData.ariaLabel = [eventRecord.name, windowLabel].filter(Boolean).join(", ");
          return {
            tag: "span",
            className: "dc-event-content",
            title: renderData.ariaLabel,
            children: [
              { tag: "strong", text: eventRecord.name },
              { tag: "small", text: windowLabel ?? "" },
            ],
          };
        }}
        onEventClick={({ eventRecord }) => selectEvent(eventRecord.id)}
      />
    </div>
  );
}
