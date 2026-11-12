/** Studio-local time helpers. The studio runs on Pacific time; everything is stored as UTC ISO strings. */
export const STUDIO_TZ = "America/Los_Angeles";
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 18;
export const STEP_MIN = 15;

function tzOffsetMin(date: Date, tz = STUDIO_TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** A Date for a wall-clock time in the studio's zone. */
export function studioDate(ymd: string, hour: number, minute = 0): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = new Date(Date.UTC(y!, m! - 1, d!, hour, minute));
  const off = tzOffsetMin(guess);
  const real = new Date(guess.getTime() - off * 60000);
  const off2 = tzOffsetMin(real);
  return off2 === off ? real : new Date(guess.getTime() - off2 * 60000);
}

/** YYYY-MM-DD of a moment in the studio's zone. */
export function studioYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STUDIO_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + days, 12));
  return t.toISOString().slice(0, 10);
}

export function studioWeekday(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, weekday: "short" }).format(d);
}

export function studioHour(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return h + m / 60;
}

export function fmtSlot(startIso: string, endIso?: string): string {
  const s = new Date(startIso);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, weekday: "short", month: "short", day: "numeric" }).format(s);
  const t = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, hour: "numeric", minute: "2-digit" }).format(d);
  return endIso ? `${day}, ${t(s)}–${t(new Date(endIso))}` : `${day}, ${t(s)}`;
}

export function partOfDay(d: Date): "morning" | "afternoon" | "evening" {
  const h = studioHour(d);
  return h < 12 ? "morning" : h < 16 ? "afternoon" : "evening";
}

export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
