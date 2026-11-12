import { useMemo, useRef } from "react";

import { CampaignBoard } from "@/daycloser/campaign-board";
import { CampaignCustomerGrid } from "@/daycloser/campaign-customer-grid";
import { buildCampaignCustomerRows } from "@/daycloser/campaign-customer-rows";
import { CampaignPanel } from "@/daycloser/campaign-panel";
import { MerchantActivity } from "@/daycloser/merchant-summary";

import { useMerchantWorkspace } from "./daycloser-merchant";

export const meta = () => [{ title: "Campaigns · DayCloser" }];

export default function StudioCampaigns() {
  const { dashboard, selectCampaign, campaignPanel } = useMerchantWorkspace();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const campaign = campaignPanel.campaign;
  const customerRows = useMemo(
    () => (campaign ? buildCampaignCustomerRows(dashboard, campaign) : []),
    [dashboard, campaign],
  );

  function openCampaign(campaignId: string) {
    selectCampaign(campaignId);
    requestAnimationFrame(() => {
      const heading = headingRef.current;
      if (!heading) return;
      const { top, bottom } = heading.getBoundingClientRect();
      if (top < 48 || bottom > window.innerHeight) {
        heading.scrollIntoView({ block: "start" });
        heading.focus({ preventScroll: true });
      }
    });
  }

  return (
    <>
      <h1
        id="dc-merchant-title"
        className="text-xl font-semibold tracking-tight"
      >
        Campaigns
      </h1>
      <div className="grid min-w-0 items-start gap-4 @min-[58rem]/daycloser:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid min-w-0 content-start gap-4 @max-[58rem]/daycloser:contents">
          <CampaignBoard
            dashboard={dashboard}
            selectedCampaignId={campaign?.id}
            onSelect={openCampaign}
          />
          {campaign && (
            <div className="order-3 min-w-0 @min-[58rem]/daycloser:order-none">
              <CampaignCustomerGrid rows={customerRows} />
            </div>
          )}
          <MerchantActivity dashboard={dashboard} />
        </div>
        <CampaignPanel
          {...campaignPanel}
          opening={campaign?.policy.opening}
          mode="campaign"
          headingRef={headingRef}
        />
      </div>
    </>
  );
}
