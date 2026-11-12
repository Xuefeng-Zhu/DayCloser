import { useActionQuery } from "@agent-native/core/client/hooks";
import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router";

import type { SchedulePayload } from "./StudioScheduler";
import "./daycloser.css";

const StudioCalendar = lazy(() => import("./StudioCalendar"));

export default function CalendarPage() {
  const [client, setClient] = useState(false);
  useEffect(() => setClient(true), []);
  const navigate = useNavigate();
  const q = useActionQuery("list-schedule", {}, { refetchInterval: 5000 });
  const data = q.data as SchedulePayload | undefined;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-6 pb-3 pt-5">
        <div className="flex items-center gap-2">
          <span className="dc-logo">◐</span>
          <h1 className="text-xl font-semibold">Calendar</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Lumen &amp; Co. Photography</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Bookings, open hours and DayCloser's live offers by day, week or agenda. Click a green opening to sell it.</p>
      </header>
      <section className="mx-6 mb-6 min-h-[560px] flex-1 overflow-hidden rounded-xl border bg-card">
        {client && data ? (
          <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading calendar…</div>}>
            <StudioCalendar data={data} onSell={(id) => navigate(`/home?opening=${encodeURIComponent(id)}`)} />
          </Suspense>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Loading calendar…</div>
        )}
      </section>
    </div>
  );
}
