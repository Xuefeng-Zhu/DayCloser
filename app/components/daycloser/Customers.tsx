import { useActionQuery } from "@agent-native/core/client/hooks";
import { lazy, Suspense, useEffect, useState } from "react";

import type { CustomerRow } from "./CustomersGrid";
import "./daycloser.css";

const CustomersGrid = lazy(() => import("./CustomersGrid"));

export default function Customers() {
  const [client, setClient] = useState(false);
  useEffect(() => setClient(true), []);
  const q = useActionQuery("list-customers", {}, { refetchInterval: 5000 });
  const rows = (q.data as CustomerRow[] | undefined) ?? [];
  const opted = rows.filter((r) => r.optedIn).length;
  const contacted = rows.filter((r) => r.optedIn && r.outreach !== "Not contacted").length;
  const deposits = rows.reduce((s, r) => s + r.depositsPaid, 0);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-end justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="dc-logo">◐</span>
            <h1 className="text-xl font-semibold">Customers</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Lumen &amp; Co. Photography</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">DayCloser only ever contacts customers who opted in to studio openings.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Stat label="Customers" value={`${rows.length}`} />
          <Stat label="Opted in" value={`${opted}`} />
          <Stat label="Contacted" value={`${contacted}`} />
          <Stat label="Deposits" value={`$${deposits}`} />
        </div>
      </header>
      <section className="mx-6 mb-6 min-h-[420px] flex-1 overflow-hidden rounded-xl border bg-card">
        {client && q.data ? (
          <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading customers…</div>}>
            <CustomersGrid rows={rows} />
          </Suspense>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Loading customers…</div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
    </div>
  );
}
