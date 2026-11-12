import { getDb } from "../db/index.js";
import * as t from "../db/schema.js";
import { addDaysYmd, studioDate, studioYmd } from "./time.js";

export const SERVICES = [
  {
    id: "svc_family",
    name: "Family Mini Session",
    durationMin: 60,
    priceCents: 24000,
    depositCents: 6000,
    description: "60-minute studio family session, 15 edited images.",
  },
  {
    id: "svc_headshot",
    name: "Professional Headshot",
    durationMin: 45,
    priceCents: 18000,
    depositCents: 4500,
    description: "45-minute headshot session, 3 retouched images.",
  },
];

export const PHOTOGRAPHERS = [
  { id: "ph_maya", name: "Maya Chen", specialty: "Families and kids", serviceIds: ["svc_family", "svc_headshot"], color: "teal" },
  { id: "ph_jordan", name: "Jordan Ellis", specialty: "Headshots and portraits", serviceIds: ["svc_headshot", "svc_family"], color: "indigo" },
];

export const CONTACTS = [
  { id: "ct_priya", name: "Priya Shah", email: "priya.shah@example.com", optedIn: 1, preferredServiceId: "svc_family", preferredPhotographerId: "ph_maya", preferredDays: ["Fri", "Sat", "Sun"], preferredTimes: ["afternoon"], lastSessionMonthsAgo: 11, notes: "Annual family photos with two kids (6 and 3). Booked Maya last December." },
  { id: "ct_marcus", name: "Marcus Lee", email: "marcus.lee@example.com", optedIn: 1, preferredServiceId: "svc_headshot", preferredPhotographerId: "ph_jordan", preferredDays: ["Mon", "Tue", "Wed", "Thu", "Fri"], preferredTimes: ["morning"], lastSessionMonthsAgo: 26, notes: "Product manager; asked about updated headshots when he changes jobs." },
  { id: "ct_elena", name: "Elena Rossi", email: "elena.rossi@example.com", optedIn: 1, preferredServiceId: "svc_family", preferredPhotographerId: "ph_maya", preferredDays: ["Thu", "Fri"], preferredTimes: ["afternoon", "evening"], lastSessionMonthsAgo: 14, notes: "Expecting a second baby in the spring; wants maternity-family photos." },
  { id: "ct_sam", name: "Sam Okafor", email: "sam.okafor@example.com", optedIn: 1, preferredServiceId: "svc_headshot", preferredPhotographerId: "", preferredDays: ["Mon", "Tue", "Wed", "Thu", "Fri"], preferredTimes: ["afternoon"], lastSessionMonthsAgo: 0, notes: "Realtor; needs headshots for a new brokerage. Never booked before." },
  { id: "ct_hannah", name: "Hannah Kim", email: "hannah.kim@example.com", optedIn: 1, preferredServiceId: "svc_family", preferredPhotographerId: "", preferredDays: ["Sat", "Sun"], preferredTimes: ["morning"], lastSessionMonthsAgo: 8, notes: "Weekends only; family of four plus a dog." },
  { id: "ct_diego", name: "Diego Alvarez", email: "diego.alvarez@example.com", optedIn: 0, preferredServiceId: "svc_headshot", preferredPhotographerId: "ph_jordan", preferredDays: ["Tue", "Wed"], preferredTimes: ["morning"], lastSessionMonthsAgo: 18, notes: "Unsubscribed from studio messages." },
  { id: "ct_grace", name: "Grace Liu", email: "grace.liu@example.com", optedIn: 1, preferredServiceId: "svc_family", preferredPhotographerId: "ph_maya", preferredDays: ["Wed", "Thu", "Fri"], preferredTimes: ["afternoon"], lastSessionMonthsAgo: 1, notes: "Had a family session three weeks ago." },
  { id: "ct_tom", name: "Tom Becker", email: "tom.becker@example.com", optedIn: 0, preferredServiceId: "svc_headshot", preferredPhotographerId: "", preferredDays: ["Fri"], preferredTimes: ["afternoon"], lastSessionMonthsAgo: 30, notes: "Never opted in to marketing." },
];

const now = () => new Date().toISOString();

type SeedBooking = { day: number; ph: string; svc: string; who: string; h: number; m?: number; status?: string };

/** Existing studio calendar for the next three studio days, leaving realistic gaps and one fresh cancellation. */
const SEED_BOOKINGS: SeedBooking[] = [
  { day: 0, ph: "ph_maya", svc: "svc_family", who: "The Nguyen family", h: 9 },
  { day: 0, ph: "ph_maya", svc: "svc_family", who: "Ava Thompson", h: 10, m: 30 },
  { day: 0, ph: "ph_maya", svc: "svc_headshot", who: "Liam Carter", h: 13 },
  { day: 0, ph: "ph_maya", svc: "svc_family", who: "Rachel Moore", h: 15, status: "cancelled" },
  { day: 0, ph: "ph_maya", svc: "svc_family", who: "The Patel family", h: 16, m: 30 },
  { day: 0, ph: "ph_jordan", svc: "svc_headshot", who: "Noah Williams", h: 9, m: 30 },
  { day: 0, ph: "ph_jordan", svc: "svc_headshot", who: "Mia Johnson", h: 11 },
  { day: 0, ph: "ph_jordan", svc: "svc_headshot", who: "Ethan Brown", h: 12 },
  { day: 0, ph: "ph_jordan", svc: "svc_family", who: "The Garcia family", h: 14 },
  { day: 0, ph: "ph_jordan", svc: "svc_headshot", who: "Olivia Davis", h: 16 },
  { day: 0, ph: "ph_jordan", svc: "svc_headshot", who: "James Wilson", h: 17 },
  { day: 1, ph: "ph_maya", svc: "svc_family", who: "Sophia Martinez", h: 9, m: 30 },
  { day: 1, ph: "ph_maya", svc: "svc_family", who: "The Anderson family", h: 11 },
  { day: 1, ph: "ph_maya", svc: "svc_family", who: "Isabella Taylor", h: 13, m: 30 },
  { day: 1, ph: "ph_maya", svc: "svc_headshot", who: "Lucas Thomas", h: 16 },
  { day: 1, ph: "ph_maya", svc: "svc_family", who: "The Hernandez family", h: 17 },
  { day: 1, ph: "ph_jordan", svc: "svc_headshot", who: "Amelia Jackson", h: 9 },
  { day: 1, ph: "ph_jordan", svc: "svc_headshot", who: "Henry White", h: 10 },
  { day: 1, ph: "ph_jordan", svc: "svc_headshot", who: "Harper Harris", h: 13 },
  { day: 1, ph: "ph_jordan", svc: "svc_headshot", who: "Daniel Clark", h: 14, status: "cancelled" },
  { day: 1, ph: "ph_jordan", svc: "svc_family", who: "The Lewis family", h: 15 },
  { day: 1, ph: "ph_jordan", svc: "svc_headshot", who: "Evelyn Walker", h: 16, m: 30 },
  { day: 2, ph: "ph_maya", svc: "svc_family", who: "The Robinson family", h: 10 },
  { day: 2, ph: "ph_maya", svc: "svc_family", who: "Abigail Young", h: 12 },
  { day: 2, ph: "ph_maya", svc: "svc_family", who: "The King family", h: 15 },
  { day: 2, ph: "ph_jordan", svc: "svc_headshot", who: "Jack Wright", h: 9 },
  { day: 2, ph: "ph_jordan", svc: "svc_headshot", who: "Emily Scott", h: 11 },
  { day: 2, ph: "ph_jordan", svc: "svc_headshot", who: "Benjamin Green", h: 14 },
  { day: 2, ph: "ph_jordan", svc: "svc_headshot", who: "Ella Adams", h: 16, m: 30 },
];

let seeding: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seeding) seeding = seedIfEmpty().catch((e) => { seeding = null; throw e; });
  return seeding;
}

async function seedIfEmpty() {
  const db = getDb();
  const existing = await db.select().from(t.services);
  if (existing.length) return;
  await writeSeed();
}

export async function resetDemo() {
  const db = getDb();
  for (const tbl of [t.activity, t.offers, t.messages, t.invitations, t.campaigns, t.bookings, t.contacts, t.services, t.photographers]) {
    await db.delete(tbl);
  }
  await writeSeed();
  seeding = Promise.resolve();
}

/** The demo calendar starts today, or tomorrow once the studio day is mostly over. */
export function demoStartYmd(): string {
  const today = studioYmd(new Date());
  const hourNow = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  return hourNow >= 15 ? addDaysYmd(today, 1) : today;
}

async function writeSeed() {
  const db = getDb();
  const ts = now();
  await db.insert(t.services).values(SERVICES);
  await db.insert(t.photographers).values(PHOTOGRAPHERS.map((p) => ({ ...p, serviceIds: JSON.stringify(p.serviceIds) })));
  await db.insert(t.contacts).values(
    CONTACTS.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      optedIn: c.optedIn,
      preferredServiceId: c.preferredServiceId,
      preferredPhotographerId: c.preferredPhotographerId,
      preferredDays: JSON.stringify(c.preferredDays),
      preferredTimes: JSON.stringify(c.preferredTimes),
      lastSessionAt: c.lastSessionMonthsAgo ? new Date(Date.now() - c.lastSessionMonthsAgo * 30.4 * 86400000).toISOString() : "",
      notes: c.notes,
    })),
  );
  const start = demoStartYmd();
  const svcById = Object.fromEntries(SERVICES.map((s) => [s.id, s]));
  await db.insert(t.bookings).values(
    SEED_BOOKINGS.map((b, i) => {
      const s = studioDate(addDaysYmd(start, b.day), b.h, b.m ?? 0);
      const e = new Date(s.getTime() + svcById[b.svc]!.durationMin * 60000);
      return {
        id: `bk_seed_${i + 1}`,
        photographerId: b.ph,
        serviceId: b.svc,
        contactId: "",
        customerName: b.who,
        startAt: s.toISOString(),
        endAt: e.toISOString(),
        status: b.status ?? "confirmed",
        source: "existing",
        cancelledAt: b.status === "cancelled" ? new Date(Date.now() - 40 * 60000).toISOString() : "",
        createdAt: ts,
        updatedAt: ts,
      };
    }),
  );
}
