import { setClientAppState, useActionQuery } from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import type { MerchantDashboard } from "@shared/daycloser";
import { useState } from "react";
import type { ComponentProps } from "react";
import { Outlet, useLocation, useOutletContext } from "react-router";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CampaignPanel } from "@/daycloser/campaign-panel";
import { time } from "@/daycloser/format";
import { dayCloserSectionForPath } from "@/daycloser/paths";

type ScheduleView = "timeline" | "calendar";

const workspaceTitles = {
  schedule: "Studio schedule",
  campaigns: "Campaigns",
  customers: "Customers",
};

type MerchantWorkspaceContext = {
  dashboard: MerchantDashboard;
  scheduleView: ScheduleView;
  setScheduleView: (view: ScheduleView) => void;
  selectedOpeningId: string | null;
  selectOpening: (openingId: string) => void;
  selectCampaign: (campaignId: string) => void;
  campaignPanel: Omit<ComponentProps<typeof CampaignPanel>, "headingRef" | "mode">;
};

export function useMerchantWorkspace() {
  return useOutletContext<MerchantWorkspaceContext>();
}

export default function MerchantWorkspace() {
  const dashboardQuery = useActionQuery("get-daycloser-dashboard", {});
  const dashboard: MerchantDashboard | undefined = dashboardQuery.data;
  const [scheduleView, setScheduleView] = useState<ScheduleView>("timeline");
  const [selection, setSelection] = useState<{
    openingId: string;
    campaignId: string | undefined;
  }>();
  const selectedOpeningId = selection?.openingId ?? null;
  const section = dayCloserSectionForPath(useLocation().pathname) ?? "schedule";
  const title = workspaceTitles[section];
  useSetPageTitle(title);

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
    if (campaign) selectOpening(campaign.policy.opening.id, campaignId);
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

  return (
    <div className="@container/daycloser min-h-full bg-background font-sans text-foreground">
      <section
        className="mx-auto flex max-w-[94rem] flex-col gap-5 px-4 py-5 @min-[58rem]/daycloser:px-6"
        aria-labelledby="dc-merchant-title"
      >
        {dashboard ? (
          <Outlet
            context={{
              dashboard,
              scheduleView,
              setScheduleView,
              selectedOpeningId,
              selectOpening,
              selectCampaign,
              campaignPanel: {
                opening,
                photographer: photographer?.name,
                campaign: selectedCampaign,
                conversations,
                timezone: dashboard.studio.timezone,
              },
            } satisfies MerchantWorkspaceContext}
          />
        ) : (
          <>
            <h1 id="dc-merchant-title" className="text-xl font-semibold tracking-tight">
              {title}
            </h1>
            {dashboardQuery.isError ? (
              <Card
                className="flex flex-wrap items-center justify-between gap-3 border border-border px-4 py-3 text-sm"
                role="alert"
              >
                <p>Could not load {title.toLowerCase()}.</p>
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
              <div className="grid gap-4" role="status" aria-label={`Loading ${title.toLowerCase()}`}>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
