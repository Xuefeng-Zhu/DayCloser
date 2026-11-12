import { lazy, Suspense, useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import type { SchedulerProps } from "./scheduler.client";

const ClientCalendar = lazy(() => import("./studio-calendar.client"));

function LoadingCalendar() {
  return (
    <div
      className="grid h-[27rem] content-start gap-4 p-4"
      role="status"
      aria-label="Loading studio calendar"
    >
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function StudioCalendar(props: SchedulerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <section
      className="daycloser-calendar order-1 min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm @min-[58rem]/daycloser:order-none"
      aria-label="Studio calendar"
    >
      {mounted ? (
        <Suspense fallback={<LoadingCalendar />}>
          <ClientCalendar {...props} />
        </Suspense>
      ) : (
        <LoadingCalendar />
      )}
    </section>
  );
}
