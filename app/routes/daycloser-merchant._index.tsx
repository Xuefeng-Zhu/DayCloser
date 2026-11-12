import { IconCalendarEvent } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { CampaignPanel } from "@/daycloser/campaign-panel";
import { dateLabel } from "@/daycloser/format";
import { MerchantTotals } from "@/daycloser/merchant-summary";
import { Scheduler } from "@/daycloser/scheduler";
import { StudioCalendar } from "@/daycloser/studio-calendar";

import { useMerchantWorkspace } from "./daycloser-merchant";

import "@/daycloser/merchant-schedule.css";

export const meta = () => [{ title: "Studio schedule · DayCloser" }];

export default function StudioSchedule() {
  const {
    dashboard,
    scheduleView,
    setScheduleView,
    selectedOpeningId,
    selectOpening,
    campaignPanel,
  } = useMerchantWorkspace();
  const { studio } = dashboard;
  const ScheduleView = scheduleView === "calendar" ? StudioCalendar : Scheduler;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h1 id="dc-merchant-title" className="text-xl font-semibold tracking-tight">
          {studio.name}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <time className="flex items-center gap-2" dateTime={studio.demoDate}>
            <IconCalendarEvent size={16} stroke={1.6} aria-hidden="true" />
            {dateLabel(studio.demoDate)}
          </time>
          <span>{studio.timezone}</span>
          <div
            role="group"
            aria-label="Studio schedule view"
            className="flex rounded-md border border-border p-0.5"
          >
            {(["timeline", "calendar"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={scheduleView === option ? "secondary" : "ghost"}
                aria-pressed={scheduleView === option}
                className="capitalize"
                onClick={() => setScheduleView(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <MerchantTotals totals={dashboard.totals} />
      <div className="grid min-w-0 items-start gap-4 @min-[58rem]/daycloser:grid-cols-[minmax(0,1fr)_18rem]">
        <ScheduleView
          dashboard={dashboard}
          selectedOpeningId={selectedOpeningId}
          onSelect={selectOpening}
        />
        <CampaignPanel {...campaignPanel} />
      </div>
    </>
  );
}
