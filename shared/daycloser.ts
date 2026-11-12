export const studioTimezone = "America/Los_Angeles";

export type Interval = {
  startAt: string;
  endAt: string;
};

export type Studio = {
  name: string;
  timezone: string;
  demoDate: string;
};

export type Resource = Interval & {
  id: string;
  name: string;
};

export type Opening = Interval & {
  id: string;
  resourceId: string;
  source: "available" | "cancellation";
};

export type ScheduleEntry = Interval & {
  id: string;
  resourceId: string;
  name: string;
  shootingEndAt: string;
  status: "appointment" | "held" | "capture_pending" | "booked";
};

export type Service = {
  id: string;
  name: string;
  shootingMinutes: number;
  bufferMinutes: number;
  editedPhotos: number;
  priceCents: number;
  depositCents: number;
  currency: "USD";
};

export type Customer = {
  id: string;
  name: string;
};

export type Contact = Customer & {
  preference: string;
  optedIn: boolean;
  eligible: boolean;
  eligibility: "eligible" | "opted_out" | "already_booked" | "unrelated_interest";
};

export type CampaignPolicy = {
  version: number;
  opening: Opening;
  services: Service[];
  contacts: Customer[];
  initialInvitationLimit: number;
  followUpLimit: number;
  expiresAt: string;
  depositCents: number;
  holdMinutes: number;
};

export type CampaignStatus = "proposed" | "active" | "paused" | "completed" | "expired";

export type Campaign = {
  id: string;
  status: CampaignStatus;
  policy: CampaignPolicy;
  createdAt: string;
  approvedAt: string | null;
  invitationsSent: number;
};

export type Offer = Interval & {
  id: string;
  campaignId: string;
  policyVersion: number;
  customerId: string;
  resourceId: string;
  shootingEndAt: string;
  serviceId: string;
  serviceName: string;
  shootingMinutes: number;
  bufferMinutes: number;
  editedPhotos: number;
  priceCents: number;
  depositCents: number;
  remainingCents: number;
  currency: "USD";
  expiresAt: string;
  status: "offered" | "superseded" | "accepted" | "closed" | "expired";
};

export type HoldStatus =
  | "held"
  | "capture_pending"
  | "booked"
  | "expired"
  | "refund_required"
  | "refunded";

export type Hold = {
  id: string;
  status: HoldStatus;
  expiresAt: string;
  snapshot: Offer;
};

export type ConversationMessage = {
  id: string;
  role: "customer" | "studio" | "system";
  body: string;
  createdAt: string;
  offerId: string | null;
};

export type CustomerConversation = {
  studio: Studio;
  customer: Customer;
  resource: Pick<Resource, "id" | "name">;
  messages: ConversationMessage[];
  offer: Offer | null;
  hold: Hold | null;
  offers: Offer[];
};

export type MerchantConversation = {
  id: string;
  campaignId: string;
  customer: Customer;
  messages: ConversationMessage[];
  offer: Offer | null;
  hold: Hold | null;
};

export type Activity = {
  id: string;
  campaignId: string | null;
  text: string;
  createdAt: string;
};

export type Totals = {
  bookedValueCents: number;
  depositsCollectedCents: number;
  outstandingBalanceCents: number;
  occupiedMinutes: number;
  shootingMinutes: number;
  bufferMinutes: number;
};

export type MerchantDashboard = {
  studio: Studio;
  resources: Resource[];
  openings: Opening[];
  appointments: ScheduleEntry[];
  campaigns: Campaign[];
  contacts: Contact[];
  services: Service[];
  conversations: MerchantConversation[];
  activity: Activity[];
  totals: Totals;
  refunds: { attemptId: string; depositCents: number; currency: string }[];
};
