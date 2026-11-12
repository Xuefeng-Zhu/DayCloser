import { setClientAppState, useActionQuery } from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import type { MerchantDashboard } from "@shared/daycloser";
import { IconCalendarEvent } from "@tabler/icons-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CampaignBoard } from "@/daycloser/campaign-board";
import { CampaignPanel } from "@/daycloser/campaign-panel";
import { dateLabel, time } from "@/daycloser/format";
import { MerchantActivity, MerchantTotals } from "@/daycloser/merchant-summary";
import { Scheduler } from "@/daycloser/scheduler";
import { StudioCalendar } from "@/daycloser/studio-calendar";

import "@/daycloser/merchant-schedule.css";

export const meta = () => [{ title: "Studio schedule · DayCloser" }];

export default function MerchantWorkspace() {
  const dashboardQuery = useActionQuery("get-daycloser-dashboard", {});
  const [view, setView] = useState<"timeline" | "calendar">("timeline");
  const [selection, setSelection] = useState<{
    openingId: string;
    campaignId: string | undefined;
  }>();
  const campaignHeading = useRef<HTMLHeadingElement>(null);
  const selectedOpeningId = selection?.openingId ?? null;
  const dashboard: MerchantDashboard | undefined = dashboardQuery.data;
  useSetPageTitle("Studio schedule");

  function selectOpening(openingId: string, campaignId?: string) {
    if (!dashboard) return;
    const campaign = dashboard.campaigns.find(({ id, policy }) =>
      campaignId ? id === campaignId : policy.opening.id === openingId,
    );
    const opening = dashboard.openings.find(({ id }) => id === openingId) ?? campaign?.policy.opening;
    if (!opening) return;
    setSelection({ openingId, campaignId });
    const resource = dashboard.resources.find(({ id }) => id === opening.resourceId);
    const label = `${resource?.name ?? "Photographer"}, ${time(opening.startAt, dashboard.studio.timezone)}–${time(opening.endAt, dashboard.studio.timezone)}`;
    void setClientAppState(
      "selection",
      {
        kind: "daycloser.opening",
        openingId,
        ...(campaign && { campaignId: campaign.id }),
        resourceId: opening.resourceId,
        startAt: opening.startAt,
        endAt: opening.endAt,
        label,
        capturedAt: Date.now(),
      },
      { keepalive: true },
    ).catch(() => undefined);
  }

  function selectCampaign(campaignId: string) {
    const campaign = dashboard?.campaigns.find(({ id }) => id === campaignId);
    if (!campaign) return;
    selectOpening(campaign.policy.opening.id, campaignId);
    requestAnimationFrame(() => {
      const heading = campaignHeading.current;
      if (!heading) return;
      const { top, bottom } = heading.getBoundingClientRect();
      if (top < 48 || bottom > window.innerHeight) {
        heading.scrollIntoView({ block: "start" });
        heading.focus({ preventScroll: true });
      }
    });
  }

  const selectedCampaign = dashboard?.campaigns.find(({ id, policy }) =>
    selection?.campaignId ? id === selection.campaignId : policy.opening.id === selectedOpeningId,
  );
  const opening =
    dashboard?.openings.find(({ id }) => id === selectedOpeningId) ??
    selectedCampaign?.policy.opening;
  const photographer = dashboard?.resources.find(({ id }) => id === opening?.resourceId);
  const conversations =
    dashboard?.conversations.filter(({ campaignId }) => campaignId === selectedCampaign?.id) ?? [];

  const ScheduleView = view === "calendar" ? StudioCalendar : Scheduler;

  return (
    <div className="@container/daycloser min-h-full bg-background font-sans text-foreground">
      <section
        className="mx-auto flex max-w-[94rem] flex-col gap-5 px-4 py-5 @min-[58rem]/daycloser:px-6"
        aria-labelledby="dc-schedule-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h1 id="dc-schedule-title" className="text-xl font-semibold tracking-tight">
            {dashboard?.studio.name ?? "Studio schedule"}
          </h1>
          {dashboard && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <time className="flex items-center gap-2" dateTime={dashboard.studio.demoDate}>
                <IconCalendarEvent size={16} stroke={1.6} aria-hidden="true" />
                {dateLabel(dashboard.studio.demoDate)}
              </time>
              <span>{dashboard.studio.timezone}</span>
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
                    variant={view === option ? "secondary" : "ghost"}
                    aria-pressed={view === option}
                    className="capitalize"
                    onClick={() => setView(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        {dashboard ? (
          <>
            <MerchantTotals totals={dashboard.totals} />
            <div className="grid min-w-0 gap-4 @min-[58rem]/daycloser:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="grid min-w-0 content-start gap-4 @max-[58rem]/daycloser:contents">
                <ScheduleView
                  dashboard={dashboard}
                  selectedOpeningId={selectedOpeningId}
                  onSelect={selectOpening}
                />
                <CampaignBoard
                  dashboard={dashboard}
                  selectedCampaignId={selectedCampaign?.id}
                  onSelect={selectCampaign}
                />
                <MerchantActivity dashboard={dashboard} />
              </div>
              <CampaignPanel
                opening={opening}
                photographer={photographer?.name}
                campaign={selectedCampaign}
                conversations={conversations}
                timezone={dashboard.studio.timezone}
                headingRef={campaignHeading}
              />
            </div>
          </>
        ) : dashboardQuery.isError ? (
          <Card
            className="flex flex-wrap items-center justify-between gap-3 border border-border px-4 py-3 text-sm"
            role="alert"
          >
            <p>The studio schedule could not be loaded.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void dashboardQuery.refetch()}
            >
              Try again
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4" role="status" aria-label="Loading your studio schedule">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
      </section>
    </div>
  );
}
