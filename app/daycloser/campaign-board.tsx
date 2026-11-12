import { lazy, Suspense, useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import type { CampaignBoardProps } from "./campaign-board.client";

const ClientBoard = lazy(() => import("./campaign-board.client"));

export function CampaignBoard(props: CampaignBoardProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const loading = (
    <div className="border-t border-border p-3" role="status" aria-label="Loading campaign board">
      <Skeleton className="h-32 w-full" />
    </div>
  );

  return (
    <section
      className="daycloser-campaign-board order-3 min-w-0 overflow-hidden rounded-lg border border-border bg-card @min-[58rem]/daycloser:order-none"
      aria-labelledby="dc-campaign-board-title"
    >
      <h2 id="dc-campaign-board-title" className="px-4 py-3 text-sm font-semibold">
        Campaigns
      </h2>
      {props.dashboard.campaigns.length === 0 ? (
        <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
          No campaigns yet. Select an opening in the schedule to start one.
        </p>
      ) : mounted ? (
        <Suspense fallback={loading}>
          <ClientBoard {...props} />
        </Suspense>
      ) : (
        loading
      )}
    </section>
  );
}
