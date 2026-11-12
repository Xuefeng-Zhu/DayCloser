import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

import type {
  CampaignCustomerReview,
  CampaignCustomerRow,
} from "./campaign-customer-rows";
import { dateTime, money } from "./format";

const ClientGrid = lazy(() => import("./campaign-customer-grid.client"));

const termsTitles = {
  current: "Offer terms",
  sent: "Sent offer terms",
  previous: "Previous offer terms",
};

function OfferTerms({
  review,
  timezone,
}: {
  review: Extract<CampaignCustomerReview, { kind: "offer" }>;
  timezone: string;
}) {
  const { offer, presentation } = review;
  const terms = [
    ["Service", offer.serviceName],
    ["Appointment", dateTime(offer.startAt, timezone)],
    [
      "Time reserved",
      `${offer.shootingMinutes} min shooting · ${offer.bufferMinutes} min buffer`,
    ],
    ["Edited photos", offer.editedPhotos],
    ["Total", money(offer.priceCents, offer.currency)],
    ["Deposit", money(offer.depositCents, offer.currency)],
    ["Balance after deposit", money(offer.remainingCents, offer.currency)],
  ];

  return (
    <section className="grid gap-3" aria-labelledby="dc-review-terms">
      <h3 id="dc-review-terms" className="text-sm font-semibold">
        {termsTitles[presentation]}
      </h3>
      <dl className="divide-y divide-border rounded-md border border-border text-sm">
        {terms.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 px-3 py-2"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="wrap-anywhere font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CampaignCustomerGrid({
  rows,
  timezone,
}: {
  rows: CampaignCustomerRow[];
  timezone: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [reviewedCustomerId, setReviewedCustomerId] = useState<string>();
  const gridRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<{ customerId: string; button: HTMLButtonElement }>(
    null,
  );
  useEffect(() => setMounted(true), []);

  const reviewedRow = rows.find(({ id }) => id === reviewedCustomerId);
  const review = reviewedRow?.review;

  function openReview(customerId: string, button: HTMLButtonElement) {
    openerRef.current = { customerId, button };
    setReviewedCustomerId(customerId);
  }

  function activateReviewOnSpace(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== " " || !(event.target instanceof HTMLButtonElement))
      return;
    const { campaignCustomerReview } = event.target.dataset;
    if (!campaignCustomerReview) return;

    // Space on the grid selects a row. Preserve activation when a review button has focus.
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) openReview(campaignCustomerReview, event.target);
  }

  const loading = (
    <div className="p-3" role="status" aria-label="Loading campaign customers">
      <Skeleton className="h-24 w-full" />
    </div>
  );

  return (
    <div
      ref={gridRef}
      tabIndex={-1}
      onKeyDownCapture={activateReviewOnSpace}
      className="daycloser-campaign-customer-grid min-w-0 overflow-hidden rounded-lg border border-border bg-card"
    >
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          No customers in this campaign.
        </p>
      ) : mounted ? (
        <Suspense fallback={loading}>
          <ClientGrid rows={rows} onReview={openReview} />
        </Suspense>
      ) : (
        loading
      )}
      <Sheet
        open={Boolean(review)}
        onOpenChange={(open) => {
          if (!open) setReviewedCustomerId(undefined);
        }}
      >
        {reviewedRow && review && (
          <SheetContent
            className="w-full overflow-y-auto sm:max-w-md"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const opener = openerRef.current;
              if (
                opener?.button.isConnected &&
                opener.button.dataset.campaignCustomerReview ===
                  opener.customerId
              ) {
                opener.button.focus({ preventScroll: true });
              } else {
                gridRef.current?.focus({ preventScroll: true });
              }
            }}
          >
            <SheetHeader className="pe-8 text-start">
              <SheetTitle>
                {review.kind === "offer" ? "Offer review" : "Exclusion reason"}
              </SheetTitle>
              <SheetDescription>
                {reviewedRow.customer} · {reviewedRow.status}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 grid gap-5">
              {review.kind === "offer" ? (
                <OfferTerms review={review} timezone={timezone} />
              ) : (
                <p className="text-sm leading-relaxed">{review.reason}</p>
              )}
              <div className="grid gap-1">
                <h3 className="text-sm font-semibold">Next step</h3>
                <p className="text-sm text-muted-foreground">
                  {reviewedRow.nextStep}
                </p>
              </div>
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
