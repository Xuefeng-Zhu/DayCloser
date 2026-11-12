import type { Hold, Offer } from "@shared/daycloser";
import { IconCircleCheck, IconClock } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { dateTime, money, time } from "./format";
import { PayPalCheckout } from "./paypal-checkout";

function useHoldCountdown(hold: Hold | null) {
  const expiresAt = hold?.status === "held" ? Date.parse(hold.expiresAt) : null;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (expiresAt === null) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);
  return expiresAt === null
    ? null
    : Math.max(0, Math.ceil((expiresAt - now) / 1_000));
}

export function CustomerOffer({
  offer,
  hold,
  resourceName,
  timezone,
  token,
  paypalClientId,
  accepting,
  onAccept,
  onUpdate,
}: {
  offer: Offer;
  hold: Hold | null;
  resourceName: string;
  timezone: string;
  token: string;
  paypalClientId: string | null;
  accepting: boolean;
  onAccept: () => void;
  onUpdate: () => Promise<unknown>;
}) {
  const seconds = useHoldCountdown(hold);
  const expired =
    hold?.status === "expired" || seconds === 0 || offer.status === "expired";
  const booked = hold?.status === "booked";
  const verifying = hold?.status === "capture_pending";
  const refundRequired = hold?.status === "refund_required";
  const refunded = hold?.status === "refunded";
  const countdown =
    seconds === null
      ? null
      : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <section className="dc-card dc-offer" aria-labelledby="dc-offer-title">
      {booked && (
        <div className="dc-offer-status dc-status-completed">
          <IconCircleCheck aria-hidden="true" size={17} /> Booking confirmed
        </div>
      )}
      <h2 id="dc-offer-title">{offer.serviceName}</h2>
      <p className="dc-offer-when">
        {resourceName} ·{" "}
        <time dateTime={offer.startAt}>
          {dateTime(offer.startAt, timezone)}
        </time>
      </p>
      <p className="dc-muted">
        {offer.shootingMinutes}-minute session · {offer.editedPhotos} edited
        photos
      </p>
      <p className="dc-muted dc-offer-buffer">
        {time(offer.startAt, timezone)}–{time(offer.shootingEndAt, timezone)}{" "}
        shooting · {offer.bufferMinutes}-minute studio buffer
      </p>

      <dl className="dc-offer-prices">
        <div>
          <dt>Total</dt>
          <dd>{money(offer.priceCents, offer.currency)}</dd>
        </div>
        <div>
          <dt>
            {booked
              ? "Deposit paid"
              : refunded
                ? "Deposit refunded"
                : "Deposit"}
          </dt>
          <dd>{money(offer.depositCents, offer.currency)}</dd>
        </div>
        <div>
          <dt>Due at studio</dt>
          <dd>{money(offer.remainingCents, offer.currency)}</dd>
        </div>
      </dl>

      {hold?.status === "held" && !expired && (
        <>
          <p className="dc-offer-status dc-status-paused" role="status">
            <IconClock size={17} aria-hidden="true" /> Held for you until{" "}
            {time(hold.expiresAt, timezone)}
            <span className="dc-countdown" aria-hidden="true">
              {countdown}
            </span>
          </p>
          <PayPalCheckout
            key={hold.id}
            holdId={hold.id}
            token={token}
            clientId={paypalClientId}
            depositCents={offer.depositCents}
            onUpdate={onUpdate}
          />
        </>
      )}
      {verifying && (
        <p className="dc-offer-status dc-status-paused" role="status">
          Verifying your PayPal deposit. Your time is still reserved.
        </p>
      )}
      {refundRequired && (
        <p className="dc-inline-error" role="status">
          The studio is reviewing your PayPal deposit for a refund.
        </p>
      )}
      {refunded && (
        <p className="dc-offer-status dc-status-completed" role="status">
          PayPal deposit refunded.
        </p>
      )}
      {expired && (
        <p className="dc-offer-status dc-status-expired" role="status">
          This offer or hold has expired. Reply to ask about another time.
        </p>
      )}
      {!hold && offer.status === "offered" && (
        <button
          type="button"
          className="dc-button dc-button-primary dc-button-full"
          disabled={accepting || expired}
          onClick={onAccept}
        >
          {accepting ? "Holding your time…" : "Accept offer"}
        </button>
      )}
      {!hold && offer.status === "closed" && (
        <p className="dc-offer-status dc-status-expired">
          This opening has been booked.
        </p>
      )}
    </section>
  );
}
