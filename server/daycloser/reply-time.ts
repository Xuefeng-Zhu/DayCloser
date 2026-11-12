import type { Interval } from "../../shared/daycloser.js";
import { studioTime } from "./availability.js";

function distanceToInterval(time: number, start: number, end: number) {
  return Math.max(start - time, time - end, 0);
}

export function resolveArrivalTime(
  reply: string,
  interpretedTime: string | null,
  demoDate: string,
  opening: Interval,
): string | undefined {
  // Prefer a single explicit arrival clock from the current reply. Free-form
  // wording and multiple alternatives still use the model's interpretation.
  const explicit = Array.from(
    reply.matchAll(
      /\b(?:until|after|from|at|around)\s+(\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?)/gi,
    ),
  );
  const clock = explicit.length === 1 ? explicit[0]?.[1] : interpretedTime;
  const match = clock
    ?.trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?$/i);
  if (!match) return undefined;

  const hourText = match[1]!;
  const minute = Number(match[2] ?? 0);
  const hour = Number(hourText);
  const period = match[3]?.toLowerCase();
  if (minute > 59 || hour > 23 || (period && (hour < 1 || hour > 12)))
    return undefined;

  const at = (localHour: number) =>
    studioTime(
      demoDate,
      `${String(localHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    );

  if (period) return at((hour % 12) + (period === "p" ? 12 : 0)).toISOString();
  if (hour === 0 || hour > 12 || hourText.startsWith("0"))
    return at(hour).toISOString();

  const morning = at(hour % 12);
  const afternoon = at((hour % 12) + 12);
  const start = Date.parse(opening.startAt);
  const end = Date.parse(opening.endAt);
  return (
    distanceToInterval(+morning, start, end) <=
    distanceToInterval(+afternoon, start, end)
      ? morning
      : afternoon
  ).toISOString();
}
