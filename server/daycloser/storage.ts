import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, type Database } from "../db/index.js";
import * as tables from "../db/schema.js";
import type {
  Contact,
  CustomerConversation,
  Hold,
  Offer,
  ScheduleEntry,
  Studio,
} from "../../shared/daycloser.js";
import { getOpenings } from "./availability.js";
import { DomainError } from "./errors.js";

export type StudioRow = typeof tables.studios.$inferSelect;
export type HoldRow = typeof tables.holds.$inferSelect;
export type PaymentAttempt = typeof tables.payments.$inferSelect;

export function studioPublic(row: StudioRow): Studio {
  return { name: row.name, timezone: row.timezone, demoDate: row.demoDate };
}

export async function getStudio(db: Database, studioId: string) {
  const [studio] = await db.select().from(tables.studios).where(eq(tables.studios.id, studioId));
  if (!studio) throw new DomainError(404, "This studio has no DayCloser demo data.");
  return studio;
}

export async function lockStudio(db: Database, studioId: string) {
  // Every writer of studio scheduling and campaign state takes this transaction lock.
  const [studio] = await db
    .select()
    .from(tables.studios)
    .where(eq(tables.studios.id, studioId))
    .for("update");
  if (!studio) throw new DomainError(404, "Studio not found.");
  return studio;
}

export function holdPublic(hold: HoldRow, now: Date): Hold {
  return {
    id: hold.id,
    status: hold.status === "held" && hold.expiresAt <= now ? "expired" : hold.status,
    expiresAt: hold.expiresAt.toISOString(),
    snapshot: hold.snapshot,
  };
}

function offerPublic(row: typeof tables.offers.$inferSelect, now: Date): Offer {
  const status =
    row.status === "offered" && Date.parse(row.snapshot.expiresAt) <= +now ? "expired" : row.status;
  return { ...row.snapshot, status };
}

export async function readSchedule(db: Database, studioId: string, now: Date) {
  const [resourceRows, appointmentRows, holdRows] = await Promise.all([
    db
      .select()
      .from(tables.resources)
      .where(eq(tables.resources.studioId, studioId))
      .orderBy(asc(tables.resources.startAt), desc(tables.resources.name)),
    db.select().from(tables.appointments).where(eq(tables.appointments.studioId, studioId)),
    db.select().from(tables.holds).where(eq(tables.holds.studioId, studioId)),
  ]);
  const resources = resourceRows.map(({ id, name, startAt, endAt }) => ({
    id,
    name,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  }));
  const appointments: ScheduleEntry[] = appointmentRows
    .filter((row) => !row.cancelled)
    .map((row) => ({
      id: row.id,
      resourceId: row.resourceId,
      name: row.name,
      startAt: row.startAt.toISOString(),
      shootingEndAt: row.shootingEndAt.toISOString(),
      endAt: row.endAt.toISOString(),
      status: "appointment",
    }));
  const reservingHolds = holdRows.filter(
    (row) => row.status === "capture_pending" || (row.status === "held" && row.expiresAt > now),
  );
  for (const hold of [...reservingHolds, ...holdRows.filter((row) => row.status === "booked")]) {
    const { resourceId, startAt, shootingEndAt, endAt, serviceName } = hold.snapshot;
    appointments.push({
      id: hold.id,
      resourceId,
      startAt,
      shootingEndAt,
      endAt,
      name: serviceName,
      status: hold.status as ScheduleEntry["status"],
    });
  }
  const openings = resources.flatMap((resource) =>
    getOpenings(
      resource,
      appointments.filter((entry) => entry.resourceId === resource.id),
      appointmentRows
        .filter((row) => row.cancelled && row.resourceId === resource.id)
        .map((row) => ({ startAt: row.startAt.toISOString(), endAt: row.endAt.toISOString() })),
      now,
    ),
  );
  return { resources, appointments, openings, holdRows, reservingHolds, appointmentRows };
}

export async function readContacts(db: Database, studioId: string, now: Date): Promise<Contact[]> {
  const [rows, existing, holds] = await Promise.all([
    db
      .select()
      .from(tables.contacts)
      .where(eq(tables.contacts.studioId, studioId))
      .orderBy(asc(tables.contacts.rank)),
    db
      .select()
      .from(tables.appointments)
      .where(
        and(eq(tables.appointments.studioId, studioId), eq(tables.appointments.cancelled, false)),
      ),
    db
      .select()
      .from(tables.holds)
      .where(and(eq(tables.holds.studioId, studioId), eq(tables.holds.status, "booked"))),
  ]);
  const booked = new Set([
    ...existing.filter((row) => row.customerId && row.startAt > now).map((row) => row.customerId),
    ...holds
      .filter((row) => Date.parse(row.snapshot.startAt) > +now)
      .map((row) => row.snapshot.customerId),
  ]);
  return rows.map(({ id, name, preference, optedIn, headshotInterest }) => {
    const eligibility = !optedIn
      ? "opted_out"
      : booked.has(id)
        ? "already_booked"
        : !headshotInterest
          ? "unrelated_interest"
          : "eligible";
    return { id, name, preference, optedIn, eligibility, eligible: eligibility === "eligible" };
  });
}

export async function readCatalog(db: Database, studioId: string) {
  const rows = await db
    .select()
    .from(tables.services)
    .where(eq(tables.services.studioId, studioId))
    .orderBy(desc(tables.services.id));
  return rows.map((row) => row.details);
}

export async function readConversation(db: Database, conversationId: string, now: Date) {
  const [messages, offerRows, holdRows] = await Promise.all([
    db
      .select()
      .from(tables.messages)
      .where(eq(tables.messages.conversationId, conversationId))
      .orderBy(asc(tables.messages.createdAt), asc(tables.messages.id)),
    db
      .select()
      .from(tables.offers)
      .where(eq(tables.offers.conversationId, conversationId))
      .orderBy(desc(tables.offers.createdAt), desc(tables.offers.id)),
    db
      .select()
      .from(tables.holds)
      .where(eq(tables.holds.conversationId, conversationId))
      .orderBy(desc(tables.holds.createdAt), desc(tables.holds.id)),
  ]);
  const offers = offerRows.map((row) => offerPublic(row, now));
  const hold = holdRows[0] ? holdPublic(holdRows[0], now) : null;
  return {
    messages: messages.map(({ id, role, body, offerId, createdAt }) => ({
      id,
      role,
      body,
      offerId,
      createdAt: createdAt.toISOString(),
    })),
    offers,
    offer: offers[0] ?? null,
    hold,
  };
}

export async function getConversationOwner(db: Database, conversationId: string) {
  const [row] = await db
    .select({
      conversation: tables.conversations,
      campaign: tables.campaigns,
      customer: { id: tables.contacts.id, name: tables.contacts.name },
      resource: { id: tables.resources.id, name: tables.resources.name },
      studio: tables.studios,
    })
    .from(tables.conversations)
    .innerJoin(tables.campaigns, eq(tables.conversations.campaignId, tables.campaigns.id))
    .innerJoin(tables.contacts, eq(tables.conversations.customerId, tables.contacts.id))
    .innerJoin(tables.resources, eq(tables.campaigns.resourceId, tables.resources.id))
    .innerJoin(tables.studios, eq(tables.campaigns.studioId, tables.studios.id))
    .where(eq(tables.conversations.id, conversationId));
  return row;
}

type ConversationOwner = NonNullable<Awaited<ReturnType<typeof getConversationOwner>>>;

function signConversation(studio: StudioRow, conversationId: string) {
  const configuredSecret = process.env.DAYCLOSER_CUSTOMER_SESSION_SECRET?.trim(); // guard:allow-env-credential — Deployment-level signing key for scoped inbox sessions.
  const secret = configuredSecret || studio.sessionSecret;
  return createHmac("sha256", secret)
    .update(studio.id)
    .update(":")
    .update(conversationId)
    .digest("base64url");
}

export async function createCustomerInboxToken(studioId: string, conversationId: string) {
  const owner = await getConversationOwner(getDb(), conversationId);
  if (owner?.studio.id !== studioId) throw new DomainError(404, "Conversation not found.");
  return conversationId + "." + signConversation(owner.studio, conversationId);
}

export async function authorizeCustomer(db: Database, token: string): Promise<ConversationOwner> {
  if (!/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token))
    throw new DomainError(404, "Customer inbox link not found.");
  const [id, signature] = token.split(".");
  const owner = await getConversationOwner(db, id!);
  if (
    !owner ||
    !timingSafeEqual(Buffer.from(signature!), Buffer.from(signConversation(owner.studio, id!)))
  ) {
    throw new DomainError(404, "Customer inbox link not found.");
  }
  return owner;
}

export async function customerView(
  db: Database,
  owner: ConversationOwner,
  now: Date,
): Promise<CustomerConversation> {
  return {
    studio: studioPublic(owner.studio),
    customer: owner.customer,
    resource: owner.resource,
    ...(await readConversation(db, owner.conversation.id, now)),
  };
}

export async function recordActivity(
  db: Database,
  studioId: string,
  campaignId: string | null,
  text: string,
  now: Date,
) {
  await db
    .insert(tables.activity)
    .values({ id: randomUUID(), studioId, campaignId, text, createdAt: now });
}

export async function insertMessage(db: Database, input: typeof tables.messages.$inferInsert) {
  const [message] = await db
    .insert(tables.messages)
    .values(input)
    .onConflictDoNothing({
      target: [tables.messages.conversationId, tables.messages.requestId],
    })
    .returning();
  return message;
}
