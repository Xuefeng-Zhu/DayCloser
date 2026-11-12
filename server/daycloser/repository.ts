import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, lte, or } from "drizzle-orm";
import type {
  Campaign,
  CampaignPolicy,
  MerchantDashboard,
  Offer,
  Service,
  Totals,
} from "../../shared/daycloser.js";
import { getDb, type Database } from "../db/index.js";
import * as tables from "../db/schema.js";
import {
  feasibleOptions,
  includes,
  minuteMs,
  money,
  overlaps,
  serviceInterval,
  studioDateTime,
  type OfferConstraints,
} from "./availability.js";
import { DomainError } from "./errors.js";
import {
  authorizeCustomer,
  customerView,
  getConversationOwner,
  getStudio,
  holdPublic,
  insertMessage,
  lockStudio,
  readCatalog,
  readContacts,
  readConversation,
  readSchedule,
  recordActivity,
  studioPublic,
} from "./storage.js";

export { DomainError } from "./errors.js";
export { resetDemoStudio, seedStudio } from "./seed.js";
export { createCustomerInboxToken } from "./storage.js";
export * from "./payments-repository.js";

const initialInvitationLimit = 3;
const depositCents = 3_000;
const holdMinutes = 5;
const campaignLimitMs = 24 * 60 * minuteMs;

type CampaignRow = typeof tables.campaigns.$inferSelect;
type PolicyRow = typeof tables.policies.$inferSelect;
type ConversationRow = typeof tables.conversations.$inferSelect;
type CampaignRecord = { row: CampaignRow; policy: PolicyRow; conversations: ConversationRow[] };

function asCampaign(record: CampaignRecord, now: Date): Campaign {
  const { row, policy, conversations } = record;
  const expired = row.status !== "completed" && Date.parse(policy.rules.expiresAt) <= +now;
  return {
    id: row.id,
    status: expired ? "expired" : row.status,
    policy: policy.rules,
    createdAt: row.createdAt.toISOString(),
    approvedAt: policy.approvedAt?.toISOString() ?? null,
    invitationsSent: conversations.length,
  };
}

async function loadCampaigns(
  db: Database,
  studioId: string,
  campaignId?: string,
): Promise<CampaignRecord[]> {
  const rows = await db
    .select({ row: tables.campaigns, policy: tables.policies })
    .from(tables.campaigns)
    .innerJoin(
      tables.policies,
      and(
        eq(tables.campaigns.id, tables.policies.campaignId),
        eq(tables.campaigns.policyVersion, tables.policies.version),
      ),
    )
    .where(
      and(
        eq(tables.campaigns.studioId, studioId),
        campaignId ? eq(tables.campaigns.id, campaignId) : undefined,
      ),
    )
    .orderBy(desc(tables.campaigns.createdAt));
  if (!rows.length) return [];
  const conversations = await db
    .select()
    .from(tables.conversations)
    .where(
      inArray(
        tables.conversations.campaignId,
        rows.map(({ row }) => row.id),
      ),
    );
  return rows.map((row) => ({
    ...row,
    conversations: conversations.filter((entry) => entry.campaignId === row.row.id),
  }));
}

async function loadCampaign(db: Database, studioId: string, campaignId: string) {
  const [record] = await loadCampaigns(db, studioId, campaignId);
  if (!record) throw new DomainError(404, "Campaign not found.");
  return record;
}

function summary(offers: Offer[]): Totals {
  const totals: Totals = {
    bookedValueCents: 0,
    depositsCollectedCents: 0,
    outstandingBalanceCents: 0,
    occupiedMinutes: 0,
    shootingMinutes: 0,
    bufferMinutes: 0,
  };
  for (const offer of offers) {
    totals.bookedValueCents += offer.priceCents;
    totals.depositsCollectedCents += offer.depositCents;
    totals.outstandingBalanceCents += offer.remainingCents;
    totals.occupiedMinutes += offer.shootingMinutes + offer.bufferMinutes;
    totals.shootingMinutes += offer.shootingMinutes;
    totals.bufferMinutes += offer.bufferMinutes;
  }
  return totals;
}

export async function getMerchantDashboard(
  studioId: string,
  now = new Date(),
): Promise<MerchantDashboard> {
  const db = getDb();
  const [studio, schedule, contacts, services, records, activity, refunds] = await Promise.all([
    getStudio(db, studioId),
    readSchedule(db, studioId, now),
    readContacts(db, studioId, now),
    readCatalog(db, studioId),
    loadCampaigns(db, studioId),
    db
      .select({
        id: tables.activity.id,
        campaignId: tables.activity.campaignId,
        text: tables.activity.text,
        createdAt: tables.activity.createdAt,
      })
      .from(tables.activity)
      .where(eq(tables.activity.studioId, studioId))
      .orderBy(desc(tables.activity.createdAt))
      .limit(30),
    db
      .select({
        attemptId: tables.payments.id,
        snapshot: tables.holds.snapshot,
        capturedAmountCents: tables.payments.capturedAmountCents,
        capturedCurrency: tables.payments.capturedCurrency,
      })
      .from(tables.payments)
      .innerJoin(tables.holds, eq(tables.payments.holdId, tables.holds.id))
      .where(
        and(
          eq(tables.payments.studioId, studioId),
          inArray(tables.payments.status, ["refund_required", "refund_pending"]),
        ),
      ),
  ]);
  const conversations = await Promise.all(
    records
      .flatMap((record) => record.conversations)
      .map(async (conversation) => {
        const customer = contacts.find(({ id }) => id === conversation.customerId);
        if (!customer) throw new Error("Conversation has no studio contact.");
        const { messages, offer, hold } = await readConversation(db, conversation.id, now);
        return {
          id: conversation.id,
          campaignId: conversation.campaignId,
          customer: { id: customer.id, name: customer.name },
          messages,
          offer,
          hold,
        };
      }),
  );
  return {
    studio: studioPublic(studio),
    resources: schedule.resources,
    appointments: schedule.appointments,
    openings: schedule.openings,
    contacts,
    services,
    campaigns: records.map((row) => asCampaign(row, now)),
    conversations,
    activity: activity.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    totals: summary(
      schedule.holdRows.filter((row) => row.status === "booked").map((row) => row.snapshot),
    ),
    refunds: refunds.map(({ attemptId, snapshot, capturedAmountCents, capturedCurrency }) => ({
      attemptId,
      depositCents: capturedAmountCents ?? snapshot.depositCents,
      currency: capturedCurrency ?? snapshot.currency,
    })),
  };
}

export async function listOpenings(studioId: string, now = new Date()) {
  return (await readSchedule(getDb(), studioId, now)).openings;
}

export async function listEligibleCustomers(studioId: string, now = new Date()) {
  return (await readContacts(getDb(), studioId, now)).filter((contact) => contact.eligible);
}

export async function proposeCampaign(studioId: string, openingId: string, clock?: Date) {
  return getDb().transaction(async (tx) => {
    await lockStudio(tx, studioId);
    const now = clock ?? new Date();
    const [schedule, contacts, services, records] = await Promise.all([
      readSchedule(tx, studioId, now),
      readContacts(tx, studioId, now),
      readCatalog(tx, studioId),
      loadCampaigns(tx, studioId),
    ]);
    const opening = schedule.openings.find(({ id }) => id === openingId);
    if (!opening)
      throw new DomainError(
        409,
        "This opening has changed. Select an available interval on the schedule.",
      );
    const existing = records
      .map((record) => asCampaign(record, now))
      .find(
        (campaign) =>
          ["proposed", "active", "paused"].includes(campaign.status) &&
          campaign.policy.opening.resourceId === opening.resourceId &&
          overlaps(campaign.policy.opening, opening),
      );
    if (existing) return existing;

    const catalog = services.filter(
      (service) => service.depositCents === depositCents && service.currency === "USD",
    );
    const audience = contacts
      .filter((contact) => contact.eligible)
      .map(({ id, name }) => ({ id, name }));
    if (!audience.length || !feasibleOptions(opening, catalog, schedule.openings, {}, now).length) {
      throw new DomainError(409, "No eligible audience or catalog service fits this opening.");
    }
    const expiresAt = new Date(
      Math.min(Date.parse(opening.endAt), +now + campaignLimitMs),
    ).toISOString();
    const rules: CampaignPolicy = {
      version: 1,
      opening,
      services: catalog,
      contacts: audience,
      initialInvitationLimit,
      followUpLimit: 1,
      expiresAt,
      depositCents,
      holdMinutes,
    };
    const [row] = await tx
      .insert(tables.campaigns)
      .values({
        id: randomUUID(),
        studioId,
        resourceId: opening.resourceId,
        status: "proposed",
        policyVersion: rules.version,
        createdAt: now,
      })
      .returning();
    const [policy] = await tx
      .insert(tables.policies)
      .values({ campaignId: row!.id, version: rules.version, rules })
      .returning();
    await recordActivity(tx, studioId, row!.id, "Campaign proposed for merchant approval.", now);
    return asCampaign({ row: row!, policy: policy!, conversations: [] }, now);
  });
}

function matchingCatalog(policy: CampaignPolicy, current: Service[]) {
  return policy.services.filter((approved) =>
    current.some(
      (service) =>
        service.id === approved.id &&
        service.name === approved.name &&
        service.priceCents === approved.priceCents &&
        service.depositCents === approved.depositCents &&
        service.currency === approved.currency &&
        service.shootingMinutes === approved.shootingMinutes &&
        service.bufferMinutes === approved.bufferMinutes &&
        service.editedPhotos === approved.editedPhotos,
    ),
  );
}

export async function approveCampaign(
  studioId: string,
  campaignId: string,
  version: number,
  clock?: Date,
) {
  return getDb().transaction(async (tx) => {
    await lockStudio(tx, studioId);
    const now = clock ?? new Date();
    const record = await loadCampaign(tx, studioId, campaignId);
    const campaign = asCampaign(record, now);
    if (campaign.policy.version !== version)
      throw new DomainError(409, "Review and approve the current policy version.");
    if (campaign.approvedAt) return campaign;
    if (campaign.status !== "proposed")
      throw new DomainError(409, "This campaign is no longer available for approval.");
    const [catalog, schedule] = await Promise.all([
      readCatalog(tx, studioId),
      readSchedule(tx, studioId, now),
    ]);
    const matches = matchingCatalog(campaign.policy, catalog);
    if (
      matches.length !== campaign.policy.services.length ||
      !feasibleOptions(campaign.policy.opening, matches, schedule.openings, {}, now).length
    ) {
      throw new DomainError(
        409,
        "The approved catalog or opening has changed. Review a fresh campaign.",
      );
    }
    await tx
      .update(tables.campaigns)
      .set({ status: "active" })
      .where(eq(tables.campaigns.id, campaignId));
    await tx
      .update(tables.policies)
      .set({ approvedAt: now })
      .where(and(eq(tables.policies.campaignId, campaignId), eq(tables.policies.version, version)));
    await enqueueJob(
      tx,
      "outreach:" + campaignId + ":" + version,
      { kind: "outreach", studioId, campaignId },
      now,
    );
    await recordActivity(tx, studioId, campaignId, "Merchant approved the outreach policy.", now);
    return { ...campaign, status: "active" as const, approvedAt: now.toISOString() };
  });
}

export async function setCampaignPaused(
  studioId: string,
  campaignId: string,
  paused: boolean,
  clock?: Date,
) {
  return getDb().transaction(async (tx) => {
    await lockStudio(tx, studioId);
    const now = clock ?? new Date();
    const record = await loadCampaign(tx, studioId, campaignId);
    const campaign = asCampaign(record, now);
    const status = paused ? "paused" : "active";
    if (campaign.status === status) return campaign;
    if (campaign.status !== (paused ? "active" : "paused"))
      throw new DomainError(409, "This campaign cannot be paused or resumed.");
    await tx.update(tables.campaigns).set({ status }).where(eq(tables.campaigns.id, campaignId));
    await recordActivity(
      tx,
      studioId,
      campaignId,
      paused ? "Campaign paused." : "Campaign resumed.",
      now,
    );
    return { ...campaign, status };
  });
}

export async function getCampaignOptions(
  studioId: string,
  campaignId: string,
  constraints: OfferConstraints = {},
  now = new Date(),
) {
  const db = getDb();
  const [record, catalog, schedule] = await Promise.all([
    loadCampaign(db, studioId, campaignId),
    readCatalog(db, studioId),
    readSchedule(db, studioId, now),
  ]);
  const campaign = asCampaign(record, now);
  if (
    campaign.status !== "active" ||
    schedule.reservingHolds.some(
      ({ snapshot }) =>
        snapshot.resourceId === campaign.policy.opening.resourceId &&
        overlaps(campaign.policy.opening, snapshot),
    )
  )
    return [];
  return feasibleOptions(
    campaign.policy.opening,
    matchingCatalog(campaign.policy, catalog),
    schedule.openings,
    constraints,
    now,
  );
}

async function enqueueJob(db: Database, id: string, payload: tables.JobPayload, now: Date) {
  await db
    .insert(tables.jobs)
    .values({
      id,
      studioId: payload.studioId,
      campaignId: payload.campaignId,
      payload,
      status: "queued",
      runAfter: now,
    })
    .onConflictDoNothing();
}

export async function readCustomer(token: string, now = new Date()) {
  const db = getDb();
  return customerView(db, await authorizeCustomer(db, token), now);
}

export async function submitCustomerReply(
  token: string,
  body: string,
  requestId: string,
  clock?: Date,
) {
  const db = getDb();
  const initial = await authorizeCustomer(db, token);
  return db.transaction(async (tx) => {
    await lockStudio(tx, initial.studio.id);
    const owner = await authorizeCustomer(tx, token);
    const now = clock ?? new Date();
    const campaign = asCampaign(await loadCampaign(tx, owner.studio.id, owner.campaign.id), now);
    if (!["active", "paused"].includes(campaign.status))
      throw new DomainError(409, "This campaign is no longer accepting replies.");
    const text = body.trim();
    if (!text || text.length > 2000 || !/^[\w-]{8,80}$/.test(requestId)) {
      throw new DomainError(400, "Enter a reply between 1 and 2,000 characters.");
    }
    const message = await insertMessage(tx, {
      id: randomUUID(),
      conversationId: owner.conversation.id,
      requestId: "customer:" + requestId,
      role: "customer",
      body: text,
      offerId: null,
      createdAt: now,
    });
    if (message) {
      await enqueueJob(
        tx,
        "reply:" + message.id,
        {
          kind: "reply",
          studioId: owner.studio.id,
          campaignId: owner.campaign.id,
          conversationId: owner.conversation.id,
          messageId: message.id,
        },
        now,
      );
      await recordActivity(
        tx,
        owner.studio.id,
        owner.campaign.id,
        owner.customer.name + " replied.",
        now,
      );
    }
    return customerView(tx, owner, now);
  });
}

export async function acceptOffer(token: string, offerId: string, clock?: Date) {
  const db = getDb();
  const initial = await authorizeCustomer(db, token);
  return db.transaction(async (tx) => {
    await lockStudio(tx, initial.studio.id);
    const owner = await authorizeCustomer(tx, token);
    const now = clock ?? new Date();
    const [offer] = await tx
      .select()
      .from(tables.offers)
      .where(
        and(eq(tables.offers.id, offerId), eq(tables.offers.conversationId, owner.conversation.id)),
      );
    if (!offer) throw new DomainError(404, "Offer not found.");
    const [existing] = await tx
      .select()
      .from(tables.holds)
      .where(eq(tables.holds.offerId, offerId));
    if (existing) return holdPublic(existing, now);
    if (
      offer.status !== "offered" ||
      Date.parse(offer.snapshot.expiresAt) <= +now ||
      Date.parse(offer.snapshot.startAt) <= +now
    ) {
      throw new DomainError(409, "This offer has expired or been updated.");
    }
    const [record, schedule, contacts] = await Promise.all([
      loadCampaign(tx, owner.studio.id, owner.campaign.id),
      readSchedule(tx, owner.studio.id, now),
      readContacts(tx, owner.studio.id, now),
    ]);
    const campaign = asCampaign(record, now);
    if (
      !["active", "paused"].includes(campaign.status) ||
      offer.snapshot.policyVersion !== campaign.policy.version ||
      !contacts.some(({ id, eligible }) => eligible && id === owner.customer.id)
    ) {
      throw new DomainError(409, "This offer is no longer available.");
    }
    const existingHold = schedule.reservingHolds.some(
      ({ snapshot }) =>
        snapshot.resourceId === offer.snapshot.resourceId &&
        overlaps(snapshot, campaign.policy.opening),
    );
    if (
      existingHold ||
      !schedule.openings.some(
        (range) =>
          range.resourceId === offer.snapshot.resourceId && includes(range, offer.snapshot),
      )
    ) {
      throw new DomainError(409, "This opening is temporarily held or has been booked.");
    }
    const snapshot = { ...offer.snapshot, status: "accepted" as const };
    const [hold] = await tx
      .insert(tables.holds)
      .values({
        id: randomUUID(),
        studioId: owner.studio.id,
        campaignId: owner.campaign.id,
        conversationId: owner.conversation.id,
        offerId,
        status: "held",
        snapshot,
        expiresAt: new Date(+now + campaign.policy.holdMinutes * minuteMs),
        createdAt: now,
      })
      .returning();
    await tx.update(tables.offers).set({ status: "accepted" }).where(eq(tables.offers.id, offerId));
    await recordActivity(
      tx,
      owner.studio.id,
      owner.campaign.id,
      "Opening held for " + owner.customer.name + ".",
      now,
    );
    return holdPublic(hold!, now);
  });
}

export type ClaimedJob = { id: string; leaseToken: string; payload: tables.JobPayload };

export async function claimJob(now = new Date()): Promise<ClaimedJob | undefined> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ id: tables.jobs.id, payload: tables.jobs.payload })
      .from(tables.jobs)
      .innerJoin(tables.campaigns, eq(tables.jobs.campaignId, tables.campaigns.id))
      .where(
        and(
          inArray(tables.campaigns.status, ["active", "completed", "expired"]),
          or(
            and(eq(tables.jobs.status, "queued"), lte(tables.jobs.runAfter, now)),
            and(eq(tables.jobs.status, "running"), lte(tables.jobs.leaseUntil, now)),
          ),
        ),
      )
      .orderBy(asc(tables.jobs.runAfter), asc(tables.jobs.id))
      .limit(1)
      .for("update", { of: tables.jobs, skipLocked: true });
    if (!row) return undefined;
    const leaseToken = randomUUID();
    await tx
      .update(tables.jobs)
      .set({ status: "running", leaseToken, leaseUntil: new Date(+now + 2 * minuteMs) })
      .where(eq(tables.jobs.id, row.id));
    return { ...row, leaseToken };
  });
}

function jobLease(jobId: string, leaseToken: string) {
  return and(
    eq(tables.jobs.id, jobId),
    eq(tables.jobs.leaseToken, leaseToken),
    eq(tables.jobs.status, "running"),
  );
}

export async function finishJob(jobId: string, leaseToken: string) {
  await getDb()
    .update(tables.jobs)
    .set({ status: "done", leaseUntil: null, leaseToken: null, lastError: null })
    .where(jobLease(jobId, leaseToken));
}

export async function failJob(
  jobId: string,
  leaseToken: string,
  _error: unknown,
  now = new Date(),
) {
  const db = getDb();
  const [row] = await db.select().from(tables.jobs).where(jobLease(jobId, leaseToken));
  if (!row) return;
  const attempts = row.attempts + 1;
  await db
    .update(tables.jobs)
    .set({
      status: attempts >= 8 ? "failed" : "queued",
      attempts,
      leaseUntil: null,
      leaseToken: null,
      runAfter: new Date(+now + Math.min(5 * minuteMs, 10_000 * 2 ** (attempts - 1))),
      lastError: "Sales agent job failed. Review model configuration and server diagnostics.",
    })
    .where(jobLease(jobId, leaseToken));
  if (attempts >= 8) {
    await recordActivity(
      db,
      row.studioId,
      row.campaignId,
      "Sales agent job stopped after retries. Review the model connection.",
      now,
    );
  }
}

export async function deferJob(
  jobId: string,
  leaseToken: string,
  delayMs = 30_000,
  now = new Date(),
) {
  await getDb()
    .update(tables.jobs)
    .set({
      status: "queued",
      runAfter: new Date(+now + delayMs),
      leaseUntil: null,
      leaseToken: null,
    })
    .where(jobLease(jobId, leaseToken));
}

export async function jobHasOutcome(job: ClaimedJob) {
  const db = getDb();
  const [offer] = await db
    .select({ id: tables.offers.id })
    .from(tables.offers)
    .where(eq(tables.offers.jobId, job.id))
    .limit(1);
  if (offer) return true;
  if (job.payload.kind === "outreach") return false;
  const [message] = await db
    .select({ id: tables.messages.id })
    .from(tables.messages)
    .where(
      and(
        eq(tables.messages.conversationId, job.payload.conversationId),
        eq(tables.messages.requestId, "job:" + job.id),
      ),
    );
  return !!message;
}

export async function getJobContext(job: ClaimedJob, now = new Date()) {
  const db = getDb();
  const { kind, studioId, campaignId } = job.payload;
  const [studio, record, contacts, schedule] = await Promise.all([
    getStudio(db, studioId),
    loadCampaign(db, studioId, campaignId),
    readContacts(db, studioId, now),
    readSchedule(db, studioId, now),
  ]);
  const campaign = asCampaign(record, now);
  const replyConversationId = job.payload.kind === "reply" ? job.payload.conversationId : null;
  const customerRefundPending = schedule.holdRows.some(
    (hold) => hold.conversationId === replyConversationId && hold.status === "refund_required",
  );
  const capacityHeld =
    customerRefundPending ||
    schedule.reservingHolds.some(
      ({ snapshot }) =>
        snapshot.resourceId === campaign.policy.opening.resourceId &&
        overlaps(snapshot, campaign.policy.opening),
    );
  const allowed = contacts.filter(
    (contact) => contact.eligible && campaign.policy.contacts.some(({ id }) => id === contact.id),
  );
  const owner =
    job.payload.kind === "reply"
      ? await getConversationOwner(db, job.payload.conversationId)
      : null;
  const conversation =
    owner?.studio.id === studioId && owner.campaign.id === campaignId
      ? await customerView(db, owner, now)
      : null;
  const latestReply = conversation
    ? [...conversation.messages].reverse().find((message) => message.role === "customer")
    : null;
  const message =
    job.payload.kind === "reply" && latestReply?.id === job.payload.messageId ? latestReply : null;
  return {
    studio: studioPublic(studio),
    campaign,
    kind,
    conversation,
    contacts: allowed,
    message,
    capacityHeld,
  };
}

type OfferInput = { serviceId: string; startAt: string; body: string };

async function lockJobScope(db: Database, job: ClaimedJob, clock?: Date) {
  const studio = await lockStudio(db, job.payload.studioId);
  const now = clock ?? new Date();
  const [lease] = await db
    .select({ payload: tables.jobs.payload })
    .from(tables.jobs)
    .where(and(jobLease(job.id, job.leaseToken), gt(tables.jobs.leaseUntil, now)))
    .for("update");
  if (
    !lease ||
    lease.payload.studioId !== job.payload.studioId ||
    lease.payload.campaignId !== job.payload.campaignId ||
    lease.payload.kind !== job.payload.kind ||
    (lease.payload.kind === "reply" &&
      job.payload.kind === "reply" &&
      (lease.payload.conversationId !== job.payload.conversationId ||
        lease.payload.messageId !== job.payload.messageId))
  ) {
    throw new DomainError(409, "This sales job is no longer active.");
  }
  const record = await loadCampaign(db, job.payload.studioId, job.payload.campaignId);
  if (asCampaign(record, now).status !== "active")
    throw new DomainError(409, "Campaign is not active.");
  return { studio, record, now };
}

async function ensureLatestReply(db: Database, job: ClaimedJob, record: CampaignRecord) {
  if (job.payload.kind !== "reply")
    throw new DomainError(403, "Only a customer reply job can use this action.");
  const { conversationId, messageId } = job.payload;
  const conversation = record.conversations.find(({ id }) => id === conversationId);
  if (!conversation) throw new DomainError(404, "Conversation not found.");
  const [latest] = await db
    .select({ id: tables.messages.id })
    .from(tables.messages)
    .where(
      and(eq(tables.messages.conversationId, conversationId), eq(tables.messages.role, "customer")),
    )
    .orderBy(desc(tables.messages.createdAt), desc(tables.messages.id))
    .limit(1);
  if (latest?.id !== messageId)
    throw new DomainError(409, "A newer customer reply is already queued.");
  return conversation;
}

function messageText(body: string) {
  const text = body.trim();
  if (
    !text ||
    text.length > 600 ||
    /\$|%|https?:\/\/|\b(?:discount|payment link|cash only)\b/i.test(text)
  ) {
    throw new DomainError(
      400,
      "Write a short greeting or note without prices, discounts, or links. The offer card provides the booking terms.",
    );
  }
  return text;
}

async function saveOffer(
  db: Database,
  job: ClaimedJob,
  input: OfferInput,
  conversation: ConversationRow,
  record: CampaignRecord,
  timezone: string,
  now: Date,
) {
  const [prior] = await db
    .select()
    .from(tables.offers)
    .where(and(eq(tables.offers.jobId, job.id), eq(tables.offers.conversationId, conversation.id)));
  if (prior) return prior.snapshot;
  if (job.payload.kind === "reply") {
    const [priorReply] = await db
      .select({ id: tables.messages.id })
      .from(tables.messages)
      .where(
        and(
          eq(tables.messages.conversationId, conversation.id),
          eq(tables.messages.requestId, "job:" + job.id),
        ),
      );
    if (priorReply) throw new DomainError(409, "This customer reply has already been handled.");
  }
  const { rules } = record.policy;
  const [catalog, schedule, contacts] = await Promise.all([
    readCatalog(db, record.row.studioId),
    readSchedule(db, record.row.studioId, now),
    readContacts(db, record.row.studioId, now),
  ]);
  if (
    !rules.contacts.some(({ id }) => id === conversation.customerId) ||
    !contacts.some(({ id, eligible }) => id === conversation.customerId && eligible)
  ) {
    throw new DomainError(403, "This contact is not eligible for the approved campaign.");
  }
  if (
    schedule.reservingHolds.some(
      ({ snapshot }) =>
        snapshot.resourceId === rules.opening.resourceId && overlaps(snapshot, rules.opening),
    )
  ) {
    throw new DomainError(409, "Selling is paused while the opening is reserved.");
  }
  if (
    schedule.holdRows.some(
      (hold) => hold.conversationId === conversation.id && hold.status === "refund_required",
    )
  ) {
    throw new DomainError(
      409,
      "Resolve this customer's PayPal refund before making another offer.",
    );
  }
  const start = new Date(input.startAt);
  const service = matchingCatalog(rules, catalog).find(({ id }) => id === input.serviceId);
  if (!service)
    throw new DomainError(403, "This service or its current catalog price was not approved.");
  if (
    Number.isNaN(+start) ||
    start <= now ||
    (+start - Date.parse(rules.opening.startAt)) % (5 * minuteMs) !== 0
  ) {
    throw new DomainError(400, "Choose an available future time on a five-minute boundary.");
  }
  const interval = serviceInterval(start, service);
  if (
    !includes(rules.opening, interval) ||
    !schedule.openings.some(
      (range) => range.resourceId === rules.opening.resourceId && includes(range, interval),
    )
  ) {
    throw new DomainError(409, "This service and buffer do not fit the opening.");
  }
  const snapshot: Offer = {
    ...interval,
    id: randomUUID(),
    campaignId: record.row.id,
    policyVersion: rules.version,
    customerId: conversation.customerId,
    resourceId: rules.opening.resourceId,
    serviceId: service.id,
    serviceName: service.name,
    shootingMinutes: service.shootingMinutes,
    bufferMinutes: service.bufferMinutes,
    editedPhotos: service.editedPhotos,
    priceCents: service.priceCents,
    depositCents: service.depositCents,
    remainingCents: service.priceCents - service.depositCents,
    currency: service.currency,
    expiresAt: new Date(Math.min(+start, Date.parse(rules.expiresAt))).toISOString(),
    status: "offered",
  };
  const note = messageText(input.body);
  const details =
    service.name +
    " at " +
    studioDateTime(snapshot.startAt, timezone) +
    ". " +
    service.editedPhotos +
    " edited photos · " +
    money(snapshot.priceCents) +
    " total · " +
    money(snapshot.depositCents) +
    " deposit · " +
    money(snapshot.remainingCents) +
    " due at the studio.";
  await db
    .update(tables.offers)
    .set({ status: "superseded" })
    .where(
      and(eq(tables.offers.conversationId, conversation.id), eq(tables.offers.status, "offered")),
    );
  await db.insert(tables.offers).values({
    id: snapshot.id,
    conversationId: conversation.id,
    jobId: job.id,
    status: "offered",
    snapshot,
    createdAt: now,
  });
  await insertMessage(db, {
    id: randomUUID(),
    conversationId: conversation.id,
    requestId: "job:" + job.id,
    role: "studio",
    body: note + "\n\n" + details,
    offerId: snapshot.id,
    createdAt: now,
  });
  const text = job.payload.kind === "outreach" ? "Invitation sent" : "Offer revised";
  await recordActivity(
    db,
    record.row.studioId,
    record.row.id,
    text +
      " for " +
      contacts.find(({ id }) => id === conversation.customerId)!.name +
      ". " +
      service.name +
      " fits in the opening with a " +
      service.bufferMinutes +
      "-minute buffer.",
    now,
  );
  return snapshot;
}

export async function sendOffer(
  job: ClaimedJob,
  input: OfferInput & { customerId: string },
  clock?: Date,
) {
  if (job.payload.kind !== "outreach")
    throw new DomainError(403, "Only an approved outreach job can send initial offers.");
  return getDb().transaction(async (tx) => {
    const { studio, record, now } = await lockJobScope(tx, job, clock);
    let conversation = record.conversations.find(
      ({ customerId }) => customerId === input.customerId,
    );
    if (!conversation) {
      if (!record.policy.rules.contacts.some(({ id }) => id === input.customerId)) {
        throw new DomainError(403, "This contact is outside the approved audience.");
      }
      if (record.conversations.length >= record.policy.rules.initialInvitationLimit)
        throw new DomainError(409, "The initial invitation limit has been reached.");
      [conversation] = await tx
        .insert(tables.conversations)
        .values({ id: randomUUID(), campaignId: record.row.id, customerId: input.customerId })
        .returning();
    }
    return saveOffer(tx, job, input, conversation!, record, studio.timezone, now);
  });
}

export async function reviseOffer(job: ClaimedJob, input: OfferInput, clock?: Date) {
  return getDb().transaction(async (tx) => {
    const { studio, record, now } = await lockJobScope(tx, job, clock);
    const conversation = await ensureLatestReply(tx, job, record);
    return saveOffer(tx, job, input, conversation, record, studio.timezone, now);
  });
}

export async function sendCustomerMessage(job: ClaimedJob, body: string, clock?: Date) {
  return getDb().transaction(async (tx) => {
    const { record, now } = await lockJobScope(tx, job, clock);
    const conversation = await ensureLatestReply(tx, job, record);
    const [{ reservingHolds }, contacts] = await Promise.all([
      readSchedule(tx, record.row.studioId, now),
      readContacts(tx, record.row.studioId, now),
    ]);
    if (
      !record.policy.rules.contacts.some(({ id }) => id === conversation.customerId) ||
      !contacts.some(({ id, eligible }) => id === conversation.customerId && eligible)
    ) {
      throw new DomainError(403, "This contact is not eligible for the approved campaign.");
    }
    if (
      reservingHolds.some(
        ({ snapshot }) =>
          snapshot.resourceId === record.policy.rules.opening.resourceId &&
          overlaps(snapshot, record.policy.rules.opening),
      )
    )
      throw new DomainError(409, "Selling is paused while the opening is reserved.");
    await insertMessage(tx, {
      id: randomUUID(),
      conversationId: conversation.id,
      requestId: "job:" + job.id,
      role: "studio",
      body: messageText(body),
      offerId: null,
      createdAt: now,
    });
    return { sent: true };
  });
}
