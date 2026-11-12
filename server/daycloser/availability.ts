import {
  studioTimezone,
  type Interval,
  type Opening,
  type Resource,
  type Service,
} from "../../shared/daycloser.js";

export const minuteMs = 60_000;

export function overlaps(left: Interval, right: Interval) {
  return (
    Date.parse(left.startAt) < Date.parse(right.endAt) &&
    Date.parse(right.startAt) < Date.parse(left.endAt)
  );
}

export function includes(outer: Interval, inner: Interval) {
  return (
    Date.parse(outer.startAt) <= Date.parse(inner.startAt) &&
    Date.parse(outer.endAt) >= Date.parse(inner.endAt)
  );
}

export function getOpenings(
  resource: Resource,
  occupied: Interval[],
  cancellations: Interval[],
  now: Date,
): Opening[] {
  const free: Opening[] = [];
  const end = Date.parse(resource.endAt);
  let cursor = Date.parse(resource.startAt);
  const ordered = [...occupied].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  function add(startMs: number, endMs: number) {
    if (endMs <= startMs || endMs <= +now) return;
    const startAt = new Date(startMs).toISOString();
    const endAt = new Date(endMs).toISOString();
    const interval = { startAt, endAt };
    free.push({
      ...interval,
      id: [resource.id, startAt, endAt].join("/"),
      resourceId: resource.id,
      source: cancellations.some((cancellation) => overlaps(interval, cancellation))
        ? "cancellation"
        : "available",
    });
  }

  for (const appointment of ordered) {
    const start = Date.parse(appointment.startAt);
    if (start >= end) break;
    add(cursor, start);
    cursor = Math.max(cursor, Date.parse(appointment.endAt));
  }
  add(cursor, end);
  return free;
}

export function serviceInterval(start: Date, service: Service) {
  const startAt = start.toISOString();
  const shootingEnd = +start + service.shootingMinutes * minuteMs;
  const shootingEndAt = new Date(shootingEnd).toISOString();
  const endAt = new Date(shootingEnd + service.bufferMinutes * minuteMs).toISOString();
  return { startAt, shootingEndAt, endAt };
}

export type OfferConstraints = {
  earliestStartAt?: string;
  budgetCents?: number;
  minimumPhotos?: number;
};

export type OfferOption = ReturnType<typeof serviceInterval> & {
  resourceId: string;
  service: Service;
};

export function feasibleOptions(
  opening: Opening,
  catalog: Service[],
  free: Opening[],
  constraints: OfferConstraints,
  now: Date,
): OfferOption[] {
  const start = Date.parse(opening.startAt);
  const end = Date.parse(opening.endAt);
  const earliest = Math.max(
    start,
    +now + 1,
    Date.parse(constraints.earliestStartAt ?? opening.startAt),
  );
  const step = 5 * minuteMs;
  const options: OfferOption[] = [];
  for (let slot = start + Math.ceil((earliest - start) / step) * step; slot < end; slot += step) {
    for (const service of catalog) {
      if (
        service.priceCents > (constraints.budgetCents ?? Infinity) ||
        service.editedPhotos < (constraints.minimumPhotos ?? 0)
      )
        continue;
      const interval = serviceInterval(new Date(slot), service);
      if (
        includes(opening, interval) &&
        free.some((range) => range.resourceId === opening.resourceId && includes(range, interval))
      ) {
        options.push({ ...interval, resourceId: opening.resourceId, service });
      }
    }
  }
  return options;
}

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: studioTimezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function nextBusinessDate(now: Date) {
  const local = dateParts.format(now);
  const candidate = new Date(local + "T12:00:00Z");
  do {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  } while ([0, 6].includes(candidate.getUTCDay()));
  return candidate.toISOString().slice(0, 10);
}

const offsetParts = new Intl.DateTimeFormat("en-US", {
  timeZone: studioTimezone,
  timeZoneName: "longOffset",
});

export function studioTime(date: string, time: string) {
  const reference = new Date(date + "T20:00:00Z");
  if (Number.isNaN(+reference) || reference.toISOString().slice(0, 10) !== date) {
    throw new RangeError("Demo date must be a valid YYYY-MM-DD date.");
  }
  const offset = offsetParts
    .formatToParts(reference)
    .find((part) => part.type === "timeZoneName")
    ?.value.slice(3);
  return new Date(date + "T" + time + ":00" + offset);
}

export function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}

export function studioDateTime(timestamp: string, timezone: string) {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp)) +
    " " +
    timezone
  );
}
