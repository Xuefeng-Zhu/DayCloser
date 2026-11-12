import { lazy, Suspense, useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import type { CampaignCustomerRow } from "./campaign-customer-rows";

const ClientGrid = lazy(() => import("./campaign-customer-grid.client"));

export function CampaignCustomerGrid({
  rows,
}: {
  rows: CampaignCustomerRow[];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const loading = (
    <div className="p-3" role="status" aria-label="Loading campaign customers">
      <Skeleton className="h-24 w-full" />
    </div>
  );

  return (
    <div className="daycloser-campaign-customer-grid min-w-0 overflow-hidden rounded-lg border border-border bg-card">
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          No customers in this campaign.
        </p>
      ) : mounted ? (
        <Suspense fallback={loading}>
          <ClientGrid rows={rows} />
        </Suspense>
      ) : (
        loading
      )}
    </div>
  );
}
