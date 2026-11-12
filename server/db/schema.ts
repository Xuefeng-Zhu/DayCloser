import { integer, pgTable, text } from "drizzle-orm/pg-core";

/** Photographers are the Bryntum Scheduler resources. */
export const photographers = pgTable("dc_photographers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  specialty: text("specialty").notNull().default(""),
  serviceIds: text("service_ids").notNull().default("[]"),
  color: text("color").notNull().default("blue"),
});

/** The two predefined services. Deposit is fixed per service: DayCloser never invents prices or discounts. */
export const services = pgTable("dc_services", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  durationMin: integer("duration_min").notNull(),
  priceCents: integer("price_cents").notNull(),
  depositCents: integer("deposit_cents").notNull(),
  description: text("description").notNull().default(""),
});

/** Synthetic customers. Only opted-in contacts may ever be invited. */
export const contacts = pgTable("dc_contacts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  optedIn: integer("opted_in").notNull().default(0),
  preferredServiceId: text("preferred_service_id").notNull().default(""),
  preferredPhotographerId: text("preferred_photographer_id").notNull().default(""),
  preferredDays: text("preferred_days").notNull().default("[]"),
  preferredTimes: text("preferred_times").notNull().default("[]"),
  lastSessionAt: text("last_session_at").notNull().default(""),
  notes: text("notes").notNull().default(""),
});

/** Bookings are Scheduler events. status: confirmed | held | cancelled. */
export const bookings = pgTable("dc_bookings", {
  id: text("id").primaryKey(),
  photographerId: text("photographer_id").notNull(),
  serviceId: text("service_id").notNull(),
  contactId: text("contact_id").notNull().default(""),
  customerName: text("customer_name").notNull(),
  startAt: text("start_at").notNull(),
  endAt: text("end_at").notNull(),
  status: text("status").notNull().default("confirmed"),
  source: text("source").notNull().default("existing"),
  offerId: text("offer_id").notNull().default(""),
  holdExpiresAt: text("hold_expires_at").notNull().default(""),
  cancelledAt: text("cancelled_at").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** A campaign is one attempt to sell one opening. status: selecting | inviting | negotiating | awaiting_payment | won | closed */
export const campaigns = pgTable("dc_campaigns", {
  id: text("id").primaryKey(),
  photographerId: text("photographer_id").notNull(),
  startAt: text("start_at").notNull(),
  endAt: text("end_at").notNull(),
  origin: text("origin").notNull(),
  cancelledBookingId: text("cancelled_booking_id").notNull().default(""),
  status: text("status").notNull().default("selecting"),
  wonContactId: text("won_contact_id").notNull().default(""),
  bookingId: text("booking_id").notNull().default(""),
  summary: text("summary").notNull().default(""),
  ownerEmail: text("owner_email").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** One invited contact inside a campaign: the conversation thread and its public link token. */
export const invitations = pgTable("dc_invitations", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  contactId: text("contact_id").notNull(),
  token: text("token").notNull(),
  status: text("status").notNull().default("invited"),
  reason: text("reason").notNull().default(""),
  needsAgent: integer("needs_agent").notNull().default(0),
  lastReplyAt: text("last_reply_at").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const messages = pgTable("dc_messages", {
  id: text("id").primaryKey(),
  invitationId: text("invitation_id").notNull(),
  role: text("role").notNull(),
  body: text("body").notNull(),
  offerId: text("offer_id").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

/** Concrete, validated offers. A new version supersedes the previous one in the same invitation. status: proposed | superseded | checkout | paid | expired */
export const offers = pgTable("dc_offers", {
  id: text("id").primaryKey(),
  invitationId: text("invitation_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  contactId: text("contact_id").notNull(),
  version: integer("version").notNull(),
  photographerId: text("photographer_id").notNull(),
  serviceId: text("service_id").notNull(),
  startAt: text("start_at").notNull(),
  endAt: text("end_at").notNull(),
  priceCents: integer("price_cents").notNull(),
  depositCents: integer("deposit_cents").notNull(),
  rationale: text("rationale").notNull().default(""),
  status: text("status").notNull().default("proposed"),
  paypalOrderId: text("paypal_order_id").notNull().default(""),
  paypalCaptureId: text("paypal_capture_id").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const activity = pgTable("dc_activity", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().default(""),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  createdAt: text("created_at").notNull(),
});
