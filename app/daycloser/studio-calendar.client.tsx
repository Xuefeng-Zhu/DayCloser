import type { EventModelConfig } from "@bryntum/calendar-enterprise";
import { BryntumCalendar } from "@bryntum/calendar-react-enterprise";
import type { BryntumCalendarProps } from "@bryntum/calendar-react-enterprise";
import type { MerchantDashboard } from "@shared/daycloser";
import { useMemo } from "react";

import { registerBryntumLicense } from "./bryntum.client";
import type { SchedulerProps } from "./scheduler.client";

import "@bryntum/grid-enterprise/grid.thin.css";
import "@bryntum/scheduler-enterprise/scheduler.thin.css";
import "@bryntum/calendar-enterprise/calendar.thin.css";
import "./studio-calendar.css";

registerBryntumLicense();

const openingPrefix = "opening:";
const statusLabels = {
  appointment: "Appointment",
  held: "Hold",
  capture_pending: "Payment pending",
  booked: "Paid booking",
};
const statusColors = {
  appointment: "gray",
  held: "purple",
  capture_pending: "orange",
  booked: "green",
};

const calendarOptions: BryntumCalendarProps = {
  ariaLabel: "Photographer calendar",
  autoCreate: false,
  dragFeature: false,
  enableDeleteKey: false,
  eventCopyPasteFeature: false,
  eventEditFeature: false,
  eventMenuFeature: false,
  eventTooltipFeature: false,
  mode: "dayresource",
  readOnly: true,
  scheduleMenuFeature: false,
  sidebar: null,
  tbar: null,
};

function calendarEvents(
  { openings, appointments }: MerchantDashboard,
  selectedOpeningId: string | null,
): EventModelConfig[] {
  const events: EventModelConfig[] = openings.map((opening) => ({
    id: `${openingPrefix}${opening.id}`,
    resourceId: opening.resourceId,
    startDate: opening.startAt,
    endDate: opening.endAt,
    name: opening.source === "cancellation" ? "Cancellation opening" : "Available",
    eventColor: "blue",
    cls:
      opening.id === selectedOpeningId
        ? "dc-calendar-opening dc-calendar-selected"
        : "dc-calendar-opening",
  }));

  for (const appointment of appointments) {
    events.push({
      id: `session:${appointment.id}`,
      resourceId: appointment.resourceId,
      startDate: appointment.startAt,
      endDate: appointment.shootingEndAt,
      name:
        appointment.status === "appointment"
          ? appointment.name
          : `${statusLabels[appointment.status]} · ${appointment.name}`,
      eventColor: statusColors[appointment.status],
    });
    if (appointment.shootingEndAt < appointment.endAt) {
      events.push({
        id: `buffer:${appointment.id}`,
        resourceId: appointment.resourceId,
        startDate: appointment.shootingEndAt,
        endDate: appointment.endAt,
        name: "Buffer",
        eventColor: "gray",
        cls: "dc-calendar-buffer",
      });
    }
  }

  return events;
}

export default function StudioCalendarClient({
  dashboard,
  selectedOpeningId,
  onSelect,
}: SchedulerProps) {
  const { demoDate, timezone } = dashboard.studio;
  const resources = useMemo(
    () => dashboard.resources.map(({ id, name }) => ({ id, name })),
    [dashboard.resources],
  );
  const events = useMemo(
    () => calendarEvents(dashboard, selectedOpeningId),
    [dashboard, selectedOpeningId],
  );
  const modes = useMemo<NonNullable<BryntumCalendarProps["modes"]>>(() => {
    const wallTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const openingTimes = dashboard.resources.map(({ startAt }) => Date.parse(startAt));
    const closingTimes = dashboard.resources.map(({ endAt }) => Date.parse(endAt));
    const dayStartTime = openingTimes.length ? wallTime.format(Math.min(...openingTimes)) : "00:00";
    const closeTime = closingTimes.length ? wallTime.format(Math.max(...closingTimes)) : "00:00";

    return {
      agenda: null,
      day: null,
      month: null,
      week: null,
      year: null,
      dayresource: {
        range: "1d",
        minResourceWidth: 128,
        dayStartTime,
        dayEndTime: closeTime === "00:00" ? 24 : closeTime,
        hourHeight: 64,
        showAllDayHeader: false,
        showHeaderAvatars: false,
        showResourceAvatars: false,
        timeAxisTimeFormat: "h A",
      },
    };
  }, [dashboard.resources, timezone]);

  function selectOpening(id: string | number, keyboardEvent?: KeyboardEvent) {
    const key = String(id);
    if (!key.startsWith(openingPrefix)) return;
    keyboardEvent?.preventDefault();
    onSelect(key.slice(openingPrefix.length));
  }

  if (resources.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">No photographers are scheduled.</p>
    );
  }

  return (
    <div className="h-[27rem] min-w-0">
      <BryntumCalendar
        {...calendarOptions}
        height="100%"
        date={demoDate}
        minDate={demoDate}
        maxDate={demoDate}
        timeZone={timezone}
        modes={modes}
        resources={resources}
        events={events}
        onEventClick={({ eventRecord }) => selectOpening(eventRecord.id)}
        onEventKeyDown={({ domEvent, eventRecord }) => {
          if (
            domEvent instanceof KeyboardEvent &&
            (domEvent.key === "Enter" || domEvent.key === " ")
          ) {
            selectOpening(eventRecord.id, domEvent);
          }
        }}
      />
    </div>
  );
}
