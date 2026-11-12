import { lazy, Suspense, useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import type { SchedulerProps } from "./scheduler.client";

const ClientScheduler = lazy(() => import("./scheduler.client"));

const legend = [
  ["opening", "Opening"],
  ["appointment", "Appointment"],
  ["held", "Hold"],
  ["capture_pending", "Payment pending"],
  ["booked", "Deposit paid"],
  ["buffer", "Buffer"],
] as const;

function LoadingSchedule() {
  return (
    <div
      className="grid h-56 content-center gap-3 p-4"
      role="status"
      aria-label="Loading photographer schedule"
    >
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

export function Scheduler({ dashboard, selectedOpeningId, onSelect }: SchedulerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <section
      className="daycloser-scheduler order-1 min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm @min-[58rem]/daycloser:order-none"
      aria-label="Studio timeline"
    >
      {mounted ? (
        <Suspense fallback={<LoadingSchedule />}>
          <ClientScheduler
            dashboard={dashboard}
            selectedOpeningId={selectedOpeningId}
            onSelect={onSelect}
          />
        </Suspense>
      ) : (
        <LoadingSchedule />
      )}
      <ul
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-3 py-3 text-xs text-muted-foreground"
        aria-label="Schedule key"
      >
        {legend.map(([variant, label]) => (
          <li key={variant} className="flex items-center gap-1.5">
            <span className={`dc-swatch dc-swatch-${variant} rounded-sm`} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}
