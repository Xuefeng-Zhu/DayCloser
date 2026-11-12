import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { studioTimezone, type Service } from "../../shared/daycloser.js";
import { getDb, type Database } from "../db/index.js";
import * as tables from "../db/schema.js";
import { nextBusinessDate, studioTime } from "./availability.js";
import { DomainError } from "./errors.js";
import { lockStudio, recordActivity } from "./storage.js";

const catalog: Service[] = [
  {
    id: "standard-headshot",
    name: "Standard Headshot",
    shootingMinutes: 60,
    bufferMinutes: 10,
    editedPhotos: 5,
    priceCents: 18_000,
    depositCents: 3_000,
    currency: "USD",
  },
  {
    id: "express-headshot",
    name: "Express Headshot",
    shootingMinutes: 30,
    bufferMinutes: 10,
    editedPhotos: 2,
    priceCents: 10_000,
    depositCents: 3_000,
    currency: "USD",
  },
];

const people = [
  {
    name: "Alex Morgan",
    preference: "Professional headshots for a LinkedIn refresh",
    optedIn: true,
    headshotInterest: true,
  },
  {
    name: "Sam Rivera",
    preference: "A professional portrait for a team page",
    optedIn: true,
    headshotInterest: true,
  },
  {
    name: "Priya Shah",
    preference: "Updated portfolio headshots",
    optedIn: true,
    headshotInterest: true,
  },
  {
    name: "Riley Chen",
    preference: "Professional headshots",
    optedIn: false,
    headshotInterest: true,
  },
  { name: "Casey Brooks", preference: "Branding headshots", optedIn: true, headshotInterest: true },
  {
    name: "Jamie Ortiz",
    preference: "Family portraits outdoors",
    optedIn: true,
    headshotInterest: false,
  },
  { name: "Taylor Kim", preference: "Wedding photography", optedIn: true, headshotInterest: false },
  {
    name: "Morgan Patel",
    preference: "Product and catalog photography",
    optedIn: true,
    headshotInterest: false,
  },
];

type SeedOptions = { demoDate?: string; now?: Date };

async function insertDemo(
  db: Database,
  studioId: string,
  { demoDate, now = new Date() }: SeedOptions,
) {
  const configuredDate = process.env.DAYCLOSER_DEMO_DATE?.trim(); // guard:allow-env-credential — Optional synthetic schedule date supplied by deployment.
  const day = demoDate ?? (configuredDate || nextBusinessDate(now));
  const at = (time: string) => studioTime(day, time);
  const [studio] = await db
    .insert(tables.studios)
    .values({
      id: studioId,
      name: "Northlight Studio",
      timezone: studioTimezone,
      demoDate: day,
      sessionSecret: randomBytes(32).toString("base64url"),
    })
    .onConflictDoNothing()
    .returning({ id: tables.studios.id });
  if (!studio) return false;

  const maya = randomUUID();
  const jordan = randomUUID();
  const contacts = people.map((person, rank) => ({ ...person, id: randomUUID(), studioId, rank }));
  await db.insert(tables.resources).values([
    { id: maya, studioId, name: "Maya", startAt: at("12:00"), endAt: at("18:00") },
    { id: jordan, studioId, name: "Jordan", startAt: at("12:00"), endAt: at("18:00") },
  ]);
  await db.insert(tables.contacts).values(contacts);
  await db
    .insert(tables.services)
    .values(catalog.map((details) => ({ studioId, id: details.id, details })));
  const appointment = (
    resourceId: string,
    name: string,
    start: string,
    shootingEnd: string,
    end: string,
  ) => ({
    id: randomUUID(),
    studioId,
    resourceId,
    name,
    startAt: at(start),
    shootingEndAt: at(shootingEnd),
    endAt: at(end),
  });
  await db
    .insert(tables.appointments)
    .values([
      appointment(maya, "Editorial portraits", "12:00", "12:45", "13:00"),
      appointment(maya, "Studio headshots", "13:00", "13:50", "14:00"),
      {
        ...appointment(maya, "Brand portraits", "15:30", "16:30", "16:40"),
        customerId: contacts[4]!.id,
      },
      appointment(jordan, "Product photography", "12:30", "13:30", "13:40"),
      { ...appointment(jordan, "Portrait session", "13:40", "14:25", "14:40"), cancelled: true },
      appointment(jordan, "Family portraits", "14:40", "15:30", "15:40"),
      appointment(jordan, "Portfolio review", "17:10", "17:40", "17:50"),
    ]);
  await recordActivity(db, studioId, null, "Northlight Studio schedule loaded.", now);
  return true;
}

export async function seedStudio(studioId: string, options: SeedOptions = {}) {
  const db = getDb();
  const [existing] = await db
    .select({ id: tables.studios.id })
    .from(tables.studios)
    .where(eq(tables.studios.id, studioId));
  if (existing) return false;
  return db.transaction((tx) => insertDemo(tx, studioId, options));
}

export async function resetDemoStudio(studioId: string, options: SeedOptions = {}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await lockStudio(tx, studioId);
    const [unsettled] = await tx
      .select({ id: tables.payments.id })
      .from(tables.payments)
      .where(
        and(
          eq(tables.payments.studioId, studioId),
          inArray(tables.payments.status, ["capture_pending", "refund_required", "refund_pending"]),
        ),
      )
      .limit(1);
    if (unsettled)
      throw new DomainError(
        409,
        "Resolve the pending deposit or refund before resetting the demo.",
      );
    await tx.delete(tables.studios).where(eq(tables.studios.id, studioId));
    return insertDemo(tx, studioId, options);
  });
}
