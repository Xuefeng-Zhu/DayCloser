import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "daycloser-initial-studio-schema",
      sql: `
CREATE TABLE "daycloser_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"studio_id" text NOT NULL,
	"campaign_id" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE "daycloser_appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"studio_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"customer_id" text,
	"name" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"shooting_end_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL
);

CREATE TABLE "daycloser_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"studio_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"status" text NOT NULL,
	"policy_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE "daycloser_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"studio_id" text NOT NULL,
	"name" text NOT NULL,
	"preference" text NOT NULL,
	"opted_in" boolean NOT NULL,
	"headshot_interest" boolean NOT NULL,
	"rank" integer NOT NULL
);

CREATE TABLE "daycloser_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"customer_id" text NOT NULL,
	CONSTRAINT "daycloser_conversation_campaign_customer" UNIQUE("campaign_id","customer_id")
);

CREATE TABLE "daycloser_holds" (
	"id" text PRIMARY KEY NOT NULL,
	"studio_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "daycloser_holds_offer_id_unique" UNIQUE("offer_id")
);

CREATE TABLE "daycloser_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"studio_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" text,
	"last_error" text
);

CREATE TABLE "daycloser_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"request_id" text NOT NULL,
	"role" text NOT NULL,
	"body" text NOT NULL,
	"offer_id" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "daycloser_message_request" UNIQUE("conversation_id","request_id")
);

CREATE TABLE "daycloser_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"job_id" text NOT NULL,
	"status" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "daycloser_offer_job_conversation" UNIQUE("job_id","conversation_id")
);

CREATE TABLE "daycloser_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"studio_id" text NOT NULL,
	"hold_id" text NOT NULL,
	"payee_merchant_id" text NOT NULL,
	"order_id" text,
	"capture_id" text,
	"refund_id" text,
	"create_request_id" text NOT NULL,
	"capture_request_id" text NOT NULL,
	"refund_request_id" text NOT NULL,
	"status" text NOT NULL,
	"capture_started_at" timestamp with time zone,
	"captured_amount_cents" integer,
	"captured_currency" text,
	CONSTRAINT "daycloser_payments_hold_id_unique" UNIQUE("hold_id"),
	CONSTRAINT "daycloser_payments_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "daycloser_payments_capture_id_unique" UNIQUE("capture_id"),
	CONSTRAINT "daycloser_payments_refund_id_unique" UNIQUE("refund_id"),
	CONSTRAINT "daycloser_payments_create_request_id_unique" UNIQUE("create_request_id"),
	CONSTRAINT "daycloser_payments_capture_request_id_unique" UNIQUE("capture_request_id"),
	CONSTRAINT "daycloser_payments_refund_request_id_unique" UNIQUE("refund_request_id")
);

CREATE TABLE "daycloser_policies" (
	"campaign_id" text NOT NULL,
	"version" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	CONSTRAINT "daycloser_policies_campaign_id_version_pk" PRIMARY KEY("campaign_id","version")
);

CREATE TABLE "daycloser_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"studio_id" text NOT NULL,
	"name" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL
);

CREATE TABLE "daycloser_services" (
	"studio_id" text NOT NULL,
	"id" text NOT NULL,
	"details" jsonb NOT NULL,
	CONSTRAINT "daycloser_services_studio_id_id_pk" PRIMARY KEY("studio_id","id")
);

CREATE TABLE "daycloser_studios" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"demo_date" text NOT NULL,
	"session_secret" text NOT NULL
);

CREATE TABLE "daycloser_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "daycloser_activity" ADD CONSTRAINT "daycloser_activity_studio_id_daycloser_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."daycloser_studios"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_activity" ADD CONSTRAINT "daycloser_activity_campaign_id_daycloser_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."daycloser_campaigns"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_appointments" ADD CONSTRAINT "daycloser_appointments_studio_id_daycloser_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."daycloser_studios"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_appointments" ADD CONSTRAINT "daycloser_appointments_resource_id_daycloser_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."daycloser_resources"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_appointments" ADD CONSTRAINT "daycloser_appointments_customer_id_daycloser_contacts_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."daycloser_contacts"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "daycloser_campaigns" ADD CONSTRAINT "daycloser_campaigns_studio_id_daycloser_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."daycloser_studios"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_campaigns" ADD CONSTRAINT "daycloser_campaigns_resource_id_daycloser_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."daycloser_resources"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_contacts" ADD CONSTRAINT "daycloser_contacts_studio_id_daycloser_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."daycloser_studios"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_conversations" ADD CONSTRAINT "daycloser_conversations_campaign_id_daycloser_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."daycloser_campaigns"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_conversations" ADD CONSTRAINT "daycloser_conversations_customer_id_daycloser_contacts_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."daycloser_contacts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_holds" ADD CONSTRAINT "daycloser_holds_studio_id_daycloser_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."daycloser_studios"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_holds" ADD CONSTRAINT "daycloser_holds_campaign_id_daycloser_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."daycloser_campaigns"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_holds" ADD CONSTRAINT "daycloser_holds_conversation_id_daycloser_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."daycloser_conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_holds" ADD CONSTRAINT "daycloser_holds_offer_id_daycloser_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."daycloser_offers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_jobs" ADD CONSTRAINT "daycloser_jobs_studio_id_daycloser_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."daycloser_studios"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_jobs" ADD CONSTRAINT "daycloser_jobs_campaign_id_daycloser_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."daycloser_campaigns"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_messages" ADD CONSTRAINT "daycloser_messages_conversation_id_daycloser_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."daycloser_conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_messages" ADD CONSTRAINT "daycloser_messages_offer_id_daycloser_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."daycloser_offers"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "daycloser_offers" ADD CONSTRAINT "daycloser_offers_conversation_id_daycloser_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."daycloser_conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_payments" ADD CONSTRAINT "daycloser_payments_studio_id_daycloser_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."daycloser_studios"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_payments" ADD CONSTRAINT "daycloser_payments_hold_id_daycloser_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."daycloser_holds"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_policies" ADD CONSTRAINT "daycloser_policies_campaign_id_daycloser_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."daycloser_campaigns"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_resources" ADD CONSTRAINT "daycloser_resources_studio_id_daycloser_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."daycloser_studios"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_services" ADD CONSTRAINT "daycloser_services_studio_id_daycloser_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."daycloser_studios"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daycloser_webhook_events" ADD CONSTRAINT "daycloser_webhook_events_attempt_id_daycloser_payments_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."daycloser_payments"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "daycloser_activity_studio" ON "daycloser_activity" USING btree ("studio_id","created_at");
CREATE INDEX "daycloser_appointments_studio" ON "daycloser_appointments" USING btree ("studio_id");
CREATE INDEX "daycloser_campaigns_studio" ON "daycloser_campaigns" USING btree ("studio_id");
CREATE INDEX "daycloser_contacts_studio" ON "daycloser_contacts" USING btree ("studio_id");
CREATE INDEX "daycloser_holds_studio" ON "daycloser_holds" USING btree ("studio_id");
CREATE INDEX "daycloser_holds_conversation" ON "daycloser_holds" USING btree ("conversation_id");
CREATE INDEX "daycloser_jobs_status_schedule" ON "daycloser_jobs" USING btree ("status","run_after");
CREATE INDEX "daycloser_offers_conversation" ON "daycloser_offers" USING btree ("conversation_id");
CREATE INDEX "daycloser_payments_status" ON "daycloser_payments" USING btree ("status");
CREATE INDEX "daycloser_resources_studio" ON "daycloser_resources" USING btree ("studio_id");
    `,
    },
  ],
  { table: "daycloser_migrations" },
);
