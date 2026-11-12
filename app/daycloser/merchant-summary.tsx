import { useActionMutation } from "@agent-native/core/client/hooks";
import type { MerchantDashboard, Totals } from "@shared/daycloser";
import { IconCheck } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { dateTime, money } from "./format";

export function MerchantTotals({ totals }: { totals: Totals }) {
  const stats = [
    { label: "Booked value", value: money(totals.bookedValueCents) },
    { label: "Deposits collected", value: money(totals.depositsCollectedCents) },
    { label: "Due at studio", value: money(totals.outstandingBalanceCents) },
    {
      label: "Occupied",
      value: `${totals.occupiedMinutes} min`,
      detail: totals.occupiedMinutes
        ? `${totals.shootingMinutes} shooting · ${totals.bufferMinutes} buffer`
        : null,
    },
  ];
  return (
    <Card className="overflow-hidden border border-border">
      <dl
        className="grid grid-cols-2 gap-px bg-border @min-[36rem]/daycloser:grid-cols-4"
        aria-label="DayCloser booking totals"
      >
        {stats.map(({ label, value, detail }) => (
          <div key={label} className="grid min-w-0 content-start gap-1 bg-card px-4 py-3">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold tracking-tight tabular-nums">{value}</dd>
            {detail && <dd className="text-xs text-muted-foreground">{detail}</dd>}
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function MerchantActivity({ dashboard }: { dashboard: MerchantDashboard }) {
  const { timezone } = dashboard.studio;
  const [confirmingRefund, setConfirmingRefund] = useState<string>();
  const refund = useActionMutation("refund-deposit", {
    onSuccess: () => setConfirmingRefund(undefined),
  });
  return (
    <div className="order-3 grid min-w-0 gap-4 @min-[58rem]/daycloser:order-none">
      {dashboard.refunds.length > 0 && (
        <Card className="border border-border p-4">
          <section aria-labelledby="dc-refunds-title">
            <h2 id="dc-refunds-title" className="text-sm font-semibold">
              Refund required
            </h2>
            {dashboard.refunds.map((payment) => (
              <div
                className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm"
                key={payment.attemptId}
              >
                <p>{money(payment.depositCents, payment.currency)} deposit</p>
                {confirmingRefund === payment.attemptId ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline-destructive"
                      disabled={refund.isPending}
                      onClick={() => refund.mutate({ attemptId: payment.attemptId })}
                    >
                      {refund.isPending ? "Refunding…" : "Confirm sandbox refund"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={refund.isPending}
                      onClick={() => setConfirmingRefund(undefined)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmingRefund(payment.attemptId)}
                  >
                    Review refund
                  </Button>
                )}
              </div>
            ))}
          </section>
        </Card>
      )}

      <Card className="border border-border">
        <section aria-labelledby="dc-activity-title">
          <h2 id="dc-activity-title" className="px-4 py-3 text-sm font-semibold">
            Activity
          </h2>
          {dashboard.activity.length ? (
            <ol className="divide-y divide-border border-t border-border">
              {dashboard.activity.map((item) => (
                <li key={item.id} className="flex items-start gap-2 px-4 py-2.5 text-sm">
                  <IconCheck
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="min-w-0 wrap-anywhere">
                    {item.text}
                    <time
                      className="mt-0.5 block text-xs text-muted-foreground"
                      dateTime={item.createdAt}
                    >
                      {dateTime(item.createdAt, timezone)}
                    </time>
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
              No campaign activity yet.
            </p>
          )}
        </section>
      </Card>
    </div>
  );
}
