import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type {
  CampaignPolicy,
  CampaignStatus,
  ConversationMessage,
  HoldStatus,
  Offer,
  Service,
} from "../../shared/daycloser.js";

export type JobPayload =
  | { kind: "outreach"; studioId: string; campaignId: string }
  | {
      kind: "reply";
      studioId: string;
      campaignId: string;
      conversationId: string;
      messageId: string;
    };

export type PaymentStatus =
  | "creating"
  | "created"
  | "capture_pending"
  | "completed"
  | "declined"
  | "refund_required"
  | "refund_pending"
  | "refunded";

const time = (name: string) => timestamp(name, { withTimezone: true });

export const studios = pgTable("daycloser_studios", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull(),
  demoDate: text("demo_date").notNull(),
  sessionSecret: text("session_secret").notNull(),
});

export const resources = pgTable(
  "daycloser_resources",
  {
    id: text("id").primaryKey(),
    studioId: text("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startAt: time("start_at").notNull(),
    endAt: time("end_at").notNull(),
  },
  (table) => [index("daycloser_resources_studio").on(table.studioId)],
);

export const contacts = pgTable(
  "daycloser_contacts",
  {
    id: text("id").primaryKey(),
    studioId: text("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    preference: text("preference").notNull(),
    optedIn: boolean("opted_in").notNull(),
    headshotInterest: boolean("headshot_interest").notNull(),
    rank: integer("rank").notNull(),
  },
  (table) => [index("daycloser_contacts_studio").on(table.studioId)],
);

export const services = pgTable(
  "daycloser_services",
  {
    studioId: text("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    details: jsonb("details").$type<Service>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.studioId, table.id] })],
);

export const appointments = pgTable(
  "daycloser_appointments",
  {
    id: text("id").primaryKey(),
    studioId: text("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    customerId: text("customer_id").references(() => contacts.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    startAt: time("start_at").notNull(),
    shootingEndAt: time("shooting_end_at").notNull(),
    endAt: time("end_at").notNull(),
    cancelled: boolean("cancelled").notNull().default(false),
  },
  (table) => [index("daycloser_appointments_studio").on(table.studioId)],
);

export const campaigns = pgTable(
  "daycloser_campaigns",
  {
    id: text("id").primaryKey(),
    studioId: text("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    status: text("status").$type<CampaignStatus>().notNull(),
    policyVersion: integer("policy_version").notNull(),
    createdAt: time("created_at").notNull(),
  },
  (table) => [index("daycloser_campaigns_studio").on(table.studioId)],
);

export const policies = pgTable(
  "daycloser_policies",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    rules: jsonb("rules").$type<CampaignPolicy>().notNull(),
    approvedAt: time("approved_at"),
  },
  (table) => [primaryKey({ columns: [table.campaignId, table.version] })],
);

export const conversations = pgTable(
  "daycloser_conversations",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("daycloser_conversation_campaign_customer").on(table.campaignId, table.customerId),
  ],
);

export const offers = pgTable(
  "daycloser_offers",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    jobId: text("job_id").notNull(),
    status: text("status").$type<Offer["status"]>().notNull(),
    snapshot: jsonb("snapshot").$type<Offer>().notNull(),
    createdAt: time("created_at").notNull(),
  },
  (table) => [
    unique("daycloser_offer_job_conversation").on(table.jobId, table.conversationId),
    index("daycloser_offers_conversation").on(table.conversationId),
  ],
);

export const messages = pgTable(
  "daycloser_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    role: text("role").$type<ConversationMessage["role"]>().notNull(),
    body: text("body").notNull(),
    offerId: text("offer_id").references(() => offers.id, { onDelete: "set null" }),
    createdAt: time("created_at").notNull(),
  },
  (table) => [unique("daycloser_message_request").on(table.conversationId, table.requestId)],
);

export const holds = pgTable(
  "daycloser_holds",
  {
    id: text("id").primaryKey(),
    studioId: text("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    offerId: text("offer_id")
      .notNull()
      .unique()
      .references(() => offers.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").$type<Offer>().notNull(),
    status: text("status").$type<HoldStatus>().notNull(),
    expiresAt: time("expires_at").notNull(),
    createdAt: time("created_at").notNull(),
  },
  (table) => [
    index("daycloser_holds_studio").on(table.studioId),
    index("daycloser_holds_conversation").on(table.conversationId),
  ],
);

export const payments = pgTable(
  "daycloser_payments",
  {
    id: text("id").primaryKey(),
    studioId: text("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    holdId: text("hold_id")
      .notNull()
      .unique()
      .references(() => holds.id, { onDelete: "cascade" }),
    payeeMerchantId: text("payee_merchant_id").notNull(),
    orderId: text("order_id").unique(),
    captureId: text("capture_id").unique(),
    refundId: text("refund_id").unique(),
    createRequestId: text("create_request_id").notNull().unique(),
    captureRequestId: text("capture_request_id").notNull().unique(),
    refundRequestId: text("refund_request_id").notNull().unique(),
    status: text("status").$type<PaymentStatus>().notNull(),
    captureStartedAt: time("capture_started_at"),
    capturedAmountCents: integer("captured_amount_cents"),
    capturedCurrency: text("captured_currency"),
  },
  (table) => [index("daycloser_payments_status").on(table.status)],
);

export const webhookEvents = pgTable("daycloser_webhook_events", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id")
    .notNull()
    .references(() => payments.id, { onDelete: "cascade" }),
  createdAt: time("created_at").notNull(),
});

export const jobs = pgTable(
  "daycloser_jobs",
  {
    id: text("id").primaryKey(),
    studioId: text("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<JobPayload>().notNull(),
    status: text("status").$type<"queued" | "running" | "done" | "failed">().notNull(),
    attempts: integer("attempts").notNull().default(0),
    runAfter: time("run_after").notNull(),
    leaseUntil: time("lease_until"),
    leaseToken: text("lease_token"),
    lastError: text("last_error"),
  },
  (table) => [index("daycloser_jobs_status_schedule").on(table.status, table.runAfter)],
);

export const activity = pgTable(
  "daycloser_activity",
  {
    id: text("id").primaryKey(),
    studioId: text("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: time("created_at").notNull(),
  },
  (table) => [index("daycloser_activity_studio").on(table.studioId, table.createdAt)],
);
