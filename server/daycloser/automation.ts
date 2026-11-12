import { emit, registerEvent } from "@agent-native/core/event-bus";
import { resourceGetByPath, resourcePut } from "@agent-native/core/resources";
import { z } from "zod";

export const REPLY_EVENT = "daycloser.customer.replied";
export const REPLY_JOB_PATH = "jobs/daycloser-adapt-offer.md";

let registered = false;
export function registerDayCloserEvents() {
  if (registered) return;
  registered = true;
  registerEvent({
    name: REPLY_EVENT,
    description: "A customer replied to a DayCloser invitation; the sales agent should adapt the offer.",
    payloadSchema: z.object({
      invitationId: z.string(),
      campaignId: z.string(),
      contactName: z.string(),
      reply: z.string(),
    }),
    example: { invitationId: "iv_123", campaignId: "cp_123", contactName: "Priya Shah", reply: "Could we do Friday after 3 instead?" },
  });
}

const JOB = `---
schedule: ""
enabled: true
triggerType: event
event: ${REPLY_EVENT}
mode: agentic
domain: daycloser
runAs: creator
---
A customer just replied to a DayCloser invitation (payload: invitationId, campaignId, contactName, reply).

1. Call get-campaign with the campaignId and read that invitation's conversation and current offer.
2. If the reply asks for a different time, day, photographer or service, call find-slots for what they asked, then call revise-offer with the best feasible match and a short, warm message that acknowledges their request. Price and deposit always follow the service; never offer discounts or invent services.
3. If nothing fits, use revise-offer with the closest feasible alternative and say plainly why.
4. If they decline, call reply-to-customer with close=true and a gracious one-liner.
5. If they only ask a question, answer with reply-to-customer.
Only act on that one invitation.`;

/** The server-side automation: every customer reply fires an event, and this job runs the agent on it. */
export async function installReplyAutomation(owner: string): Promise<string> {
  try {
    const existing = await resourceGetByPath(owner, REPLY_JOB_PATH);
    if (existing) return "already installed";
    await resourcePut(owner, REPLY_JOB_PATH, JOB, "text/markdown");
    return "installed";
  } catch (e) {
    return `not installed: ${(e as Error).message}`;
  }
}

export function emitCustomerReply(owner: string, payload: { invitationId: string; campaignId: string; contactName: string; reply: string }) {
  if (!owner) return false;
  registerDayCloserEvents();
  try {
    emit(REPLY_EVENT, payload, { owner });
    return true;
  } catch {
    return false;
  }
}
