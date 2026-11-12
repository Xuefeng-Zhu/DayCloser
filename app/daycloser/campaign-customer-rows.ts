import type {
  Campaign,
  Contact,
  Hold,
  MerchantConversation,
  MerchantDashboard,
} from "@shared/daycloser";

import { money, time } from "./format";

export type CampaignCustomerRow = {
  id: string;
  customer: string;
  needs: string;
  offer: string;
  status: string;
  nextStep: string;
};

type Progress = Pick<CampaignCustomerRow, "status" | "nextStep">;

function latestCustomerReply(conversation: MerchantConversation | undefined) {
  let studioResponded = false;
  for (const message of [...(conversation?.messages ?? [])].reverse()) {
    if (message.role === "studio") studioResponded = true;
    if (message.role === "customer") {
      return {
        text: message.body.trim().replace(/\s+/g, " "),
        unanswered: !studioResponded,
      };
    }
  }
}

function currentHold(conversation: MerchantConversation | undefined) {
  const hold = conversation?.hold;
  const offer = conversation?.offer;
  if (
    hold &&
    (hold.status === "expired" || hold.status === "refunded") &&
    offer &&
    offer.id !== hold.snapshot.id
  ) {
    return null;
  }
  return hold;
}

function paymentProgress(hold: Hold | null | undefined): Progress | undefined {
  if (!hold) return;
  switch (hold.status) {
    case "booked":
      return {
        status: "Booked",
        nextStep: `${money(hold.snapshot.remainingCents, hold.snapshot.currency)} due at the studio.`,
      };
    case "capture_pending":
      return {
        status: "Payment pending",
        nextStep: "Wait for PayPal verification.",
      };
    case "held":
      return {
        status: "Held",
        nextStep: `Await the customer's ${money(hold.snapshot.depositCents, hold.snapshot.currency)} deposit.`,
      };
    case "refund_required":
      return {
        status: "Refund required",
        nextStep: "Review the PayPal refund.",
      };
    case "refunded":
      return { status: "Refunded", nextStep: "No payment action needed." };
  }
}

function exclusionProgress(contact: Contact | undefined): Progress {
  switch (contact?.eligibility) {
    case "opted_out":
      return { status: "Opted out", nextStep: "Do not contact." };
    case "already_booked":
      return {
        status: "Already booked",
        nextStep: "Keep the existing appointment.",
      };
    case "unrelated_interest":
      return { status: "Unrelated interest", nextStep: "Skip this campaign." };
    case "eligible":
      return {
        status: "Outside campaign policy",
        nextStep: "Keep outreach within the selected audience.",
      };
    default:
      return {
        status: "Contact unavailable",
        nextStep: "Verify eligibility before any outreach.",
      };
  }
}

function emptyOffer(contact: Contact | undefined, inAudience: boolean) {
  if (contact?.eligibility === "opted_out") return "Do not contact";
  if (!contact?.eligible) return "Not eligible for outreach";
  return inAudience ? "No offer yet" : "Outside campaign audience";
}

function outreachProgress(
  campaign: Campaign,
  contact: Contact | undefined,
  inAudience: boolean,
  conversation: MerchantConversation | undefined,
  hold: Hold | null | undefined,
  unansweredReply: boolean,
  openingHeld: boolean,
): Progress {
  const payment = paymentProgress(hold);
  if (payment) return payment;
  if (!inAudience) return exclusionProgress(contact);

  const offerStatus = conversation?.offer?.status;
  if (campaign.status === "completed") {
    return {
      status:
        offerStatus === "closed"
          ? "Offer closed"
          : conversation
            ? "Campaign completed"
            : "Not contacted",
      nextStep: "No further outreach.",
    };
  }
  if (campaign.status === "expired") {
    return {
      status: hold?.status === "expired" ? "Hold expired" : "Campaign expired",
      nextStep: "Select a current opening for new outreach.",
    };
  }
  if (!contact?.eligible) return exclusionProgress(contact);
  if (campaign.status === "proposed") {
    return {
      status: "Awaiting approval",
      nextStep: "Approve the campaign before outreach.",
    };
  }

  const paused = campaign.status === "paused";
  const resume = "Resume the campaign to continue outreach.";
  const waitForOpening = "Wait for the opening to be released.";
  if (unansweredReply) {
    return {
      status: "Customer replied",
      nextStep: paused
        ? resume
        : openingHeld
          ? waitForOpening
          : "Check for an updated offer.",
    };
  }
  if (hold?.status === "expired" || offerStatus === "expired") {
    return {
      status: hold?.status === "expired" ? "Hold expired" : "Offer expired",
      nextStep: paused
        ? resume
        : "Wait for the customer to request a new offer.",
    };
  }
  if (offerStatus === "offered") {
    return {
      status: "Offer sent",
      nextStep: openingHeld ? waitForOpening : "Await customer acceptance.",
    };
  }
  if (paused) return { status: "Paused", nextStep: resume };
  if (campaign.invitationsSent >= campaign.policy.initialInvitationLimit) {
    return {
      status: "Not contacted",
      nextStep: "The initial invitation limit has been reached.",
    };
  }
  return {
    status: "Not contacted",
    nextStep: openingHeld ? waitForOpening : "Monitor campaign outreach.",
  };
}

export function buildCampaignCustomerRows(
  dashboard: MerchantDashboard,
  campaign: Campaign,
): CampaignCustomerRow[] {
  const contacts = new Map(
    dashboard.contacts.map((contact) => [contact.id, contact]),
  );
  const audience = new Set(campaign.policy.contacts.map(({ id }) => id));
  const conversations = dashboard.conversations.filter(
    ({ campaignId }) => campaignId === campaign.id,
  );
  const conversationsByCustomer = new Map(
    conversations.map((conversation) => [
      conversation.customer.id,
      conversation,
    ]),
  );
  const customers = new Map(
    [
      ...campaign.policy.contacts,
      ...dashboard.contacts,
      ...conversations.map(({ customer }) => customer),
    ].map((customer) => [customer.id, customer]),
  );

  const { opening } = campaign.policy;
  const openingHeld = dashboard.appointments.some(
    (entry) =>
      (entry.status === "held" || entry.status === "capture_pending") &&
      entry.resourceId === opening.resourceId &&
      Date.parse(entry.startAt) < Date.parse(opening.endAt) &&
      Date.parse(opening.startAt) < Date.parse(entry.endAt),
  );
  const { timezone } = dashboard.studio;

  return [...customers.values()].map((customer) => {
    const contact = contacts.get(customer.id);
    const inAudience = audience.has(customer.id);
    const conversation = conversationsByCustomer.get(customer.id);
    const reply = latestCustomerReply(conversation);
    const hold = currentHold(conversation);
    const recordedOffer = hold?.snapshot ?? conversation?.offer;
    const progress = outreachProgress(
      campaign,
      contact,
      inAudience,
      conversation,
      hold,
      reply?.unanswered === true,
      openingHeld,
    );
    const sentOffer =
      recordedOffer?.status === "offered" &&
      contact?.eligible &&
      inAudience &&
      (campaign.status === "active" || campaign.status === "paused");
    const offerIsCurrent = hold
      ? hold.status === "held" ||
        hold.status === "capture_pending" ||
        hold.status === "booked"
      : sentOffer && !reply?.unanswered && !openingHeld;
    const offerPrefix = offerIsCurrent
      ? ""
      : sentOffer
        ? "Sent offer: "
        : "Previous offer: ";
    const offer = recordedOffer
      ? `${offerPrefix}${recordedOffer.serviceName} · ${time(recordedOffer.startAt, timezone)} · ${money(recordedOffer.priceCents, recordedOffer.currency)} total`
      : emptyOffer(contact, inAudience);
    return {
      id: customer.id,
      customer: contact?.name ?? customer.name,
      needs:
        [contact?.preference, reply?.text && `Latest reply: ${reply.text}`]
          .filter(Boolean)
          .join(" · ") || "No recorded preference",
      offer,
      ...progress,
    };
  });
}
