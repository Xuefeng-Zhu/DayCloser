import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { emitCustomerReply } from "../../../../../daycloser/automation.js";
import { getCampaignRow, recordCustomerReply } from "../../../../../daycloser/core.js";

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") ?? "";
  const body = (await readBody(event)) as { message?: string };
  try {
    const r = await recordCustomerReply(token, String(body?.message ?? ""));
    const camp = await getCampaignRow(r.invitation.campaignId);
    const automated = emitCustomerReply(camp.ownerEmail, { invitationId: r.invitation.id, campaignId: camp.id, contactName: r.contactName, reply: r.text });
    return { ok: true, automated };
  } catch (e) {
    throw createError({ statusCode: 400, statusMessage: (e as Error).message });
  }
});
