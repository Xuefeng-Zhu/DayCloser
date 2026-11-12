import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "../db/index.js";
import * as t from "../db/schema.js";
import { CLOSE_HOUR, OPEN_HOUR, STEP_MIN, addDaysYmd, fmtSlot, money, partOfDay, studioDate, studioWeekday, studioYmd } from "./time.js";
import { demoStartYmd, ensureSeeded } from "./seed.js";

export const DAYS_SHOWN = 3;
export const HOLD_MINUTES = 15;
export const MIN_LEAD_MINUTES = 30;

export const now = () => new Date().toISOString();
export const newId = (p: string) => `${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const parse = <T,>(s: string, d: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return d;
  }
};

export type Opening = {
  id: string;
  photographerId: string;
  photographerName: string;
  startAt: string;
  endAt: string;
  minutes: number;
  origin: "unbooked" | "cancellation";
  cancelledBookingId: string;
  cancelledCustomer: string;
  label: string;
  campaignId: string;
  campaignStatus: string;
};

export async function studio() {
  await ensureSeeded();
  const db = getDb();
  const [photographers, services] = await Promise.all([db.select().from(t.photographers), db.select().from(t.services)]);
  return {
    photographers: photographers.map((p) => ({ ...p, serviceIds: parse<string[]>(p.serviceIds, []) })),
    services,
  };
}

export async function getService(id: string) {
  const { services } = await studio();
  const s = services.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown service ${id}. The studio only sells: ${services.map((x) => `${x.id} (${x.name})`).join(", ")}.`);
  return s;
}

export async function getPhotographer(id: string) {
  const { photographers } = await studio();
  const p = photographers.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown photographer ${id}. Photographers: ${photographers.map((x) => `${x.id} (${x.name})`).join(", ")}.`);
  return p;
}

/** Bookings that occupy the calendar: confirmed ones, plus checkout holds that have not expired. */
export async function activeBookings() {
  const rows = await getDb().select().from(t.bookings);
  const nowMs = Date.now();
  return rows.filter((b) => b.status === "confirmed" || (b.status === "held" && b.holdExpiresAt && Date.parse(b.holdExpiresAt) > nowMs));
}

export function demoDays(): string[] {
  const start = demoStartYmd();
  return Array.from({ length: DAYS_SHOWN }, (_, i) => addDaysYmd(start, i));
}

export function scheduleWindow() {
  const days = demoDays();
  return { startAt: studioDate(days[0]!, 0).toISOString(), endAt: studioDate(addDaysYmd(days[days.length - 1]!, 1), 0).toISOString(), days };
}

/** Unused capacity: every gap of at least the shortest service inside working hours, tagged with whether a cancellation created it. */
export async function computeOpenings(): Promise<Opening[]> {
  const { photographers, services } = await studio();
  const db = getDb();
  const all = await db.select().from(t.bookings);
  const busy = await activeBookings();
  const camps = await db.select().from(t.campaigns);
  const minDur = Math.min(...services.map((s) => s.durationMin));
  const earliest = Date.now() + MIN_LEAD_MINUTES * 60000;
  const out: Opening[] = [];
  for (const ymd of demoDays()) {
    for (const p of photographers) {
      const open = studioDate(ymd, OPEN_HOUR).getTime();
      const close = studioDate(ymd, CLOSE_HOUR).getTime();
      const taken = busy
        .filter((b) => b.photographerId === p.id)
        .map((b) => [Date.parse(b.startAt), Date.parse(b.endAt)] as const)
        .filter(([s, e]) => e > open && s < close)
        .sort((a, b) => a[0] - b[0]);
      let cursor = Math.max(open, roundUp(earliest));
      const gaps: [number, number][] = [];
      for (const [s, e] of taken) {
        if (s > cursor) gaps.push([cursor, s]);
        cursor = Math.max(cursor, e);
      }
      if (close > cursor) gaps.push([cursor, close]);
      for (const [s, e] of gaps) {
        const minutes = Math.round((e - s) / 60000);
        if (minutes < minDur) continue;
        const cancelled = all.find(
          (b) => b.photographerId === p.id && b.status === "cancelled" && Date.parse(b.startAt) < e && Date.parse(b.endAt) > s,
        );
        const startAt = new Date(s).toISOString();
        const endAt = new Date(e).toISOString();
        const camp = camps
          .filter((c) => c.photographerId === p.id && Date.parse(c.startAt) < e && Date.parse(c.endAt) > s && c.status !== "closed" && c.status !== "won")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        out.push({
          id: `op_${p.id}_${s}`,
          photographerId: p.id,
          photographerName: p.name,
          startAt,
          endAt,
          minutes,
          origin: cancelled ? "cancellation" : "unbooked",
          cancelledBookingId: cancelled?.id ?? "",
          cancelledCustomer: cancelled?.customerName ?? "",
          label: `${p.name} · ${fmtSlot(startAt, endAt)}`,
          campaignId: camp?.id ?? "",
          campaignStatus: camp?.status ?? "",
        });
      }
    }
  }
  return out.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

function roundUp(ms: number) {
  const step = STEP_MIN * 60000;
  return Math.ceil(ms / step) * step;
}

export type SlotCheck = { ok: true; startAt: string; endAt: string } | { ok: false; reason: string };

/** The single feasibility rule every offer and every move must pass. */
export async function checkSlot(photographerId: string, serviceId: string, startAt: string, ignoreBookingId = ""): Promise<SlotCheck> {
  const p = await getPhotographer(photographerId);
  const s = await getService(serviceId);
  if (!p.serviceIds.includes(serviceId)) return { ok: false, reason: `${p.name} does not offer ${s.name}.` };
  const start = Date.parse(startAt);
  if (Number.isNaN(start)) return { ok: false, reason: `Invalid start time ${startAt}.` };
  const end = start + s.durationMin * 60000;
  if (start < Date.now() + MIN_LEAD_MINUTES * 60000) return { ok: false, reason: `That time is in the past or less than ${MIN_LEAD_MINUTES} minutes away.` };
  const ymd = studioYmd(new Date(start));
  if (start < studioDate(ymd, OPEN_HOUR).getTime() || end > studioDate(ymd, CLOSE_HOUR).getTime())
    return { ok: false, reason: `Outside studio hours (${OPEN_HOUR}:00–${CLOSE_HOUR}:00 Pacific).` };
  if ((start / 60000) % STEP_MIN !== 0) return { ok: false, reason: `Start times must be on a ${STEP_MIN}-minute boundary.` };
  const clash = (await activeBookings()).find(
    (b) => b.photographerId === photographerId && b.id !== ignoreBookingId && Date.parse(b.startAt) < end && Date.parse(b.endAt) > start,
  );
  if (clash) return { ok: false, reason: `${p.name} is busy ${fmtSlot(clash.startAt, clash.endAt)} (${clash.status === "held" ? "held for checkout" : clash.customerName}).` };
  return { ok: true, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };
}

/** Feasible start times for a service, optionally narrowed to a photographer, a studio day and a part of the day. */
export async function findSlots(opts: { serviceId: string; photographerId?: string | undefined; day?: string | undefined; partOfDay?: string | undefined; limit?: number | undefined }) {
  const { photographers } = await studio();
  const svc = await getService(opts.serviceId);
  const days = opts.day ? [opts.day] : demoDays();
  const phs = photographers.filter((p) => (!opts.photographerId || p.id === opts.photographerId) && p.serviceIds.includes(svc.id));
  const out: { photographerId: string; photographerName: string; startAt: string; endAt: string; label: string; partOfDay: string }[] = [];
  for (const ymd of days) {
    for (const p of phs) {
      for (let m = OPEN_HOUR * 60; m + svc.durationMin <= CLOSE_HOUR * 60; m += STEP_MIN) {
        const start = studioDate(ymd, Math.floor(m / 60), m % 60).toISOString();
        const pod = partOfDay(new Date(start));
        if (opts.partOfDay && pod !== opts.partOfDay) continue;
        const r = await checkSlot(p.id, svc.id, start);
        if (r.ok) out.push({ photographerId: p.id, photographerName: p.name, startAt: r.startAt, endAt: r.endAt, label: `${p.name} · ${fmtSlot(r.startAt, r.endAt)}`, partOfDay: pod });
      }
    }
  }
  out.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return out.slice(0, opts.limit ?? 12);
}

export async function logActivity(campaignId: string, kind: string, text: string) {
  await getDb().insert(t.activity).values({ id: newId("ac"), campaignId, kind, text, createdAt: now() });
}

export async function startCampaign(input: { photographerId: string; startAt: string; endAt: string; ownerEmail?: string | undefined }) {
  await ensureSeeded();
  const openings = await computeOpenings();
  const s = Date.parse(input.startAt);
  const e = Date.parse(input.endAt);
  const op = openings.find((o) => o.photographerId === input.photographerId && Date.parse(o.startAt) <= s + 60000 && Date.parse(o.endAt) >= e - 60000)
    ?? openings.find((o) => o.photographerId === input.photographerId && Date.parse(o.startAt) < e && Date.parse(o.endAt) > s);
  if (!op) throw new Error("That time is no longer open. Refresh the schedule and pick a green opening.");
  if (op.campaignId) return { campaignId: op.campaignId, existing: true, opening: op };
  const db = getDb();
  const id = newId("cp");
  const ts = now();
  await db.insert(t.campaigns).values({
    id,
    photographerId: op.photographerId,
    startAt: op.startAt,
    endAt: op.endAt,
    origin: op.origin,
    cancelledBookingId: op.cancelledBookingId,
    status: "selecting",
    ownerEmail: input.ownerEmail ?? "",
    createdAt: ts,
    updatedAt: ts,
  });
  await logActivity(id, "campaign", `Selling ${op.label} (${op.origin === "cancellation" ? `opened by ${op.cancelledCustomer}'s cancellation` : "never booked"}).`);
  return { campaignId: id, existing: false, opening: op };
}

export async function getCampaignRow(id: string) {
  const [c] = await getDb().select().from(t.campaigns).where(eq(t.campaigns.id, id));
  if (!c) throw new Error(`No campaign ${id}. Call list-campaigns for ids.`);
  return c;
}

async function setCampaign(id: string, patch: Partial<typeof t.campaigns.$inferInsert>) {
  await getDb().update(t.campaigns).set({ ...patch, updatedAt: now() }).where(eq(t.campaigns.id, id));
}

/** Deterministic, explainable audience selection. Opted-out contacts are never returned. */
export async function rankContacts(campaignId: string, limit = 3) {
  const c = await getCampaignRow(campaignId);
  const p = await getPhotographer(c.photographerId);
  const { services } = await studio();
  const db = getDb();
  const contacts = await db.select().from(t.contacts);
  const invs = await db.select().from(t.invitations);
  const openCampaigns = new Set((await db.select().from(t.campaigns)).filter((x) => !["won", "closed"].includes(x.status)).map((x) => x.id));
  const start = new Date(c.startAt);
  const weekday = studioWeekday(start);
  const pod = partOfDay(start);
  const gapMin = (Date.parse(c.endAt) - Date.parse(c.startAt)) / 60000;
  const ranked = contacts.map((ct) => {
    const reasons: string[] = [];
    let score = 0;
    const days = parse<string[]>(ct.preferredDays, []);
    const times = parse<string[]>(ct.preferredTimes, []);
    const svc = services.find((s) => s.id === ct.preferredServiceId);
    if (svc && p.serviceIds.includes(svc.id) && svc.durationMin <= gapMin) {
      score += 3;
      reasons.push(`${svc.name} fits this ${gapMin}-minute opening`);
    }
    if (ct.preferredPhotographerId === p.id) {
      score += 2;
      reasons.push(`has booked ${p.name} before`);
    }
    if (days.includes(weekday)) {
      score += 1;
      reasons.push(`likes ${weekday}s`);
    } else if (days.length) {
      score -= 2;
      reasons.push(`usually books ${days.join("/")}`);
    }
    if (times.includes(pod)) {
      score += 2;
      reasons.push(`prefers ${pod}s`);
    }
    const months = ct.lastSessionAt ? (Date.now() - Date.parse(ct.lastSessionAt)) / (30.4 * 86400000) : null;
    if (months === null) {
      score += 1;
      reasons.push("new lead, never booked");
    } else if (months >= 6) {
      score += 2;
      reasons.push(`last session ${Math.round(months)} months ago`);
    } else if (months < 2) {
      score -= 3;
      reasons.push(`just had a session ${Math.round(months * 4.3)} weeks ago`);
    }
    const already = invs.filter((i) => i.contactId === ct.id && openCampaigns.has(i.campaignId) && !["declined", "closed"].includes(i.status));
    return {
      contactId: ct.id,
      name: ct.name,
      optedIn: !!ct.optedIn,
      score,
      reasons,
      preferredServiceId: ct.preferredServiceId,
      notes: ct.notes,
      alreadyInvitedHere: invs.some((i) => i.contactId === ct.id && i.campaignId === campaignId),
      busyElsewhere: already.some((i) => i.campaignId !== campaignId),
    };
  });
  // Never pile a second invitation on someone who already has a live one.
  const eligible = ranked.filter((r) => r.optedIn && !r.alreadyInvitedHere && !r.busyElsewhere).sort((a, b) => b.score - a.score);
  const excluded = [
    ...ranked.filter((r) => !r.optedIn).map((r) => ({ name: r.name, reason: "not opted in to studio messages" })),
    ...ranked.filter((r) => r.optedIn && r.busyElsewhere).map((r) => ({ name: r.name, reason: "already has a live invitation for another opening" })),
  ];
  return { campaignId, opening: `${p.name} · ${fmtSlot(c.startAt, c.endAt)}`, candidates: eligible.slice(0, limit), excludedCount: excluded.length, excluded };
}

async function nextVersion(invitationId: string) {
  const rows = await getDb().select().from(t.offers).where(eq(t.offers.invitationId, invitationId));
  return rows.reduce((m, r) => Math.max(m, r.version), 0) + 1;
}

async function createOffer(inv: typeof t.invitations.$inferSelect, o: { serviceId: string; photographerId: string; startAt: string; rationale: string }) {
  const svc = await getService(o.serviceId);
  const check = await checkSlot(o.photographerId, o.serviceId, o.startAt);
  if (!check.ok) throw new Error(`Offer rejected: ${check.reason} Call find-slots to get feasible times.`);
  const db = getDb();
  const live = await db.select().from(t.offers).where(and(eq(t.offers.invitationId, inv.id), inArray(t.offers.status, ["proposed", "checkout"])));
  for (const l of live) {
    if (l.status === "checkout") {
      const holds = await db.select().from(t.bookings).where(and(eq(t.bookings.offerId, l.id), eq(t.bookings.status, "held")));
      if (holds.some((h) => Date.parse(h.holdExpiresAt) > Date.now()))
        throw new Error("The customer is in PayPal checkout for the current offer; wait for it to finish or expire.");
    }
    await db.update(t.offers).set({ status: "superseded", updatedAt: now() }).where(eq(t.offers.id, l.id));
  }
  const id = newId("of");
  const ts = now();
  const row = {
    id,
    invitationId: inv.id,
    campaignId: inv.campaignId,
    contactId: inv.contactId,
    version: await nextVersion(inv.id),
    photographerId: o.photographerId,
    serviceId: svc.id,
    startAt: check.startAt,
    endAt: check.endAt,
    priceCents: svc.priceCents,
    depositCents: svc.depositCents,
    rationale: o.rationale,
    status: "proposed",
    createdAt: ts,
    updatedAt: ts,
  };
  await db.insert(t.offers).values(row);
  return row;
}

export async function sendInvitation(input: { campaignId: string; contactId: string; message: string; serviceId: string; photographerId?: string | undefined; startAt: string; rationale?: string | undefined }) {
  const c = await getCampaignRow(input.campaignId);
  if (["won", "closed"].includes(c.status)) throw new Error(`Campaign is ${c.status}.`);
  const db = getDb();
  const [ct] = await db.select().from(t.contacts).where(eq(t.contacts.id, input.contactId));
  if (!ct) throw new Error(`No contact ${input.contactId}.`);
  if (!ct.optedIn) throw new Error(`${ct.name} has not opted in to studio messages. DayCloser never contacts them.`);
  const dup = await db.select().from(t.invitations).where(and(eq(t.invitations.campaignId, c.id), eq(t.invitations.contactId, ct.id)));
  if (dup.length) throw new Error(`${ct.name} was already invited for this opening (invitation ${dup[0]!.id}). Use revise-offer instead.`);
  const ts = now();
  const inv = { id: newId("iv"), campaignId: c.id, contactId: ct.id, token: randomBytes(9).toString("base64url"), status: "invited", createdAt: ts, updatedAt: ts };
  await db.insert(t.invitations).values(inv);
  let offer;
  try {
    offer = await createOffer({ ...inv, reason: "", needsAgent: 0, lastReplyAt: "" }, { serviceId: input.serviceId, photographerId: input.photographerId || c.photographerId, startAt: input.startAt, rationale: input.rationale ?? "" });
  } catch (e) {
    await db.delete(t.invitations).where(eq(t.invitations.id, inv.id));
    throw e;
  }
  await db.insert(t.messages).values({ id: newId("ms"), invitationId: inv.id, role: "agent", body: input.message, offerId: offer.id, createdAt: now() });
  await setCampaign(c.id, { status: "inviting" });
  const svc = await getService(offer.serviceId);
  await logActivity(c.id, "invite", `Invited ${ct.name}: ${svc.name}, ${fmtSlot(offer.startAt, offer.endAt)}, ${money(offer.depositCents)} deposit.`);
  return { invitationId: inv.id, link: `/offer/${inv.token}`, offerId: offer.id, version: offer.version, slot: fmtSlot(offer.startAt, offer.endAt) };
}

export async function getInvitation(id: string) {
  const [inv] = await getDb().select().from(t.invitations).where(eq(t.invitations.id, id));
  if (!inv) throw new Error(`No invitation ${id}.`);
  return inv;
}

export async function getInvitationByToken(token: string) {
  const [inv] = await getDb().select().from(t.invitations).where(eq(t.invitations.token, token));
  if (!inv) throw new Error("This invitation link is not valid.");
  return inv;
}

export async function reviseOffer(input: { invitationId: string; message: string; serviceId: string; photographerId: string; startAt: string; rationale: string }) {
  const inv = await getInvitation(input.invitationId);
  const c = await getCampaignRow(inv.campaignId);
  if (c.status === "won" && c.wonContactId !== inv.contactId) throw new Error("This opening has already been sold to another customer.");
  const offer = await createOffer(inv, input);
  const db = getDb();
  await db.insert(t.messages).values({ id: newId("ms"), invitationId: inv.id, role: "agent", body: input.message, offerId: offer.id, createdAt: now() });
  await db.update(t.invitations).set({ needsAgent: 0, status: "negotiating", updatedAt: now() }).where(eq(t.invitations.id, inv.id));
  await setCampaign(c.id, { status: "negotiating" });
  const [ct] = await db.select().from(t.contacts).where(eq(t.contacts.id, inv.contactId));
  const svc = await getService(offer.serviceId);
  const ph = await getPhotographer(offer.photographerId);
  await logActivity(c.id, "offer", `Offer v${offer.version} for ${ct?.name}: ${svc.name} with ${ph.name}, ${fmtSlot(offer.startAt, offer.endAt)}. ${input.rationale}`);
  return { offerId: offer.id, version: offer.version, slot: fmtSlot(offer.startAt, offer.endAt), service: svc.name, photographer: ph.name, deposit: money(offer.depositCents) };
}

export async function replyToCustomer(input: { invitationId: string; message: string; close?: boolean | undefined }) {
  const inv = await getInvitation(input.invitationId);
  const db = getDb();
  await db.insert(t.messages).values({ id: newId("ms"), invitationId: inv.id, role: "agent", body: input.message, offerId: "", createdAt: now() });
  await db.update(t.invitations).set({ needsAgent: 0, status: input.close ? "declined" : inv.status, updatedAt: now() }).where(eq(t.invitations.id, inv.id));
  if (input.close) {
    await db.update(t.offers).set({ status: "expired", updatedAt: now() }).where(and(eq(t.offers.invitationId, inv.id), eq(t.offers.status, "proposed")));
    const [ct] = await db.select().from(t.contacts).where(eq(t.contacts.id, inv.contactId));
    await logActivity(inv.campaignId, "closed", `${ct?.name} declined; conversation closed.`);
  }
  return { ok: true };
}

export async function recordCustomerReply(token: string, body: string) {
  const inv = await getInvitationByToken(token);
  const text = body.trim().slice(0, 1000);
  if (!text) throw new Error("Message is empty.");
  const db = getDb();
  await db.insert(t.messages).values({ id: newId("ms"), invitationId: inv.id, role: "customer", body: text, offerId: "", createdAt: now() });
  await db.update(t.invitations).set({ needsAgent: 1, status: "replied", lastReplyAt: now(), updatedAt: now() }).where(eq(t.invitations.id, inv.id));
  const [ct] = await db.select().from(t.contacts).where(eq(t.contacts.id, inv.contactId));
  await logActivity(inv.campaignId, "reply", `${ct?.name} replied: “${text.slice(0, 140)}”`);
  return { invitation: inv, contactName: ct?.name ?? "", text };
}

export async function campaignDetail(id: string) {
  const c = await getCampaignRow(id);
  const db = getDb();
  const ph = await getPhotographer(c.photographerId);
  const { services, photographers } = await studio();
  const invs = await db.select().from(t.invitations).where(eq(t.invitations.campaignId, id));
  const contacts = await db.select().from(t.contacts);
  const msgs = invs.length ? await db.select().from(t.messages).where(inArray(t.messages.invitationId, invs.map((i) => i.id))) : [];
  const offs = invs.length ? await db.select().from(t.offers).where(inArray(t.offers.invitationId, invs.map((i) => i.id))) : [];
  const acts = await db.select().from(t.activity).where(eq(t.activity.campaignId, id)).orderBy(desc(t.activity.createdAt));
  const describeOffer = (o: typeof t.offers.$inferSelect) => ({
    id: o.id,
    version: o.version,
    status: o.status,
    service: services.find((s) => s.id === o.serviceId)?.name ?? o.serviceId,
    serviceId: o.serviceId,
    photographer: photographers.find((p) => p.id === o.photographerId)?.name ?? o.photographerId,
    photographerId: o.photographerId,
    startAt: o.startAt,
    endAt: o.endAt,
    slot: fmtSlot(o.startAt, o.endAt),
    price: money(o.priceCents),
    deposit: money(o.depositCents),
    rationale: o.rationale,
    paypalOrderId: o.paypalOrderId,
    paypalCaptureId: o.paypalCaptureId,
  });
  return {
    id: c.id,
    status: c.status,
    origin: c.origin,
    opening: { photographerId: c.photographerId, photographer: ph.name, startAt: c.startAt, endAt: c.endAt, slot: fmtSlot(c.startAt, c.endAt) },
    wonContactId: c.wonContactId,
    bookingId: c.bookingId,
    invitations: invs
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((i) => {
        const ct = contacts.find((x) => x.id === i.contactId);
        const myOffers = offs.filter((o) => o.invitationId === i.id).sort((a, b) => a.version - b.version);
        return {
          id: i.id,
          contactId: i.contactId,
          name: ct?.name ?? i.contactId,
          email: ct?.email ?? "",
          status: i.status,
          needsAgent: !!i.needsAgent,
          link: `/offer/${i.token}`,
          token: i.token,
          messages: msgs
            .filter((m) => m.invitationId === i.id)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .map((m) => ({ id: m.id, role: m.role, body: m.body, offerVersion: myOffers.find((o) => o.id === m.offerId)?.version ?? null, at: m.createdAt })),
          offers: myOffers.map(describeOffer),
          currentOffer: (() => {
            const cur = [...myOffers].reverse().find((o) => o.status !== "superseded");
            return cur ? describeOffer(cur) : null;
          })(),
        };
      }),
    activity: acts.map((a) => ({ kind: a.kind, text: a.text, at: a.createdAt })),
  };
}

export async function listCampaigns() {
  const rows = await getDb().select().from(t.campaigns).orderBy(desc(t.campaigns.createdAt));
  const { photographers } = await studio();
  return rows.map((c) => ({
    id: c.id,
    status: c.status,
    origin: c.origin,
    photographer: photographers.find((p) => p.id === c.photographerId)?.name ?? "",
    slot: fmtSlot(c.startAt, c.endAt),
    startAt: c.startAt,
    endAt: c.endAt,
    photographerId: c.photographerId,
    updatedAt: c.updatedAt,
  }));
}

export async function pendingReplies() {
  const db = getDb();
  const invs = await db.select().from(t.invitations).where(eq(t.invitations.needsAgent, 1));
  return invs.map((i) => ({ invitationId: i.id, campaignId: i.campaignId, contactId: i.contactId, lastReplyAt: i.lastReplyAt }));
}

/** Customer-facing view of one invitation: no other customers, no internal scoring. */
export async function publicThread(token: string) {
  const inv = await getInvitationByToken(token);
  const detail = await campaignDetail(inv.campaignId);
  const mine = detail.invitations.find((i) => i.id === inv.id)!;
  const c = await getCampaignRow(inv.campaignId);
  const soldElsewhere = c.status === "won" && c.wonContactId !== inv.contactId;
  const svc = mine.currentOffer ? await getService(mine.currentOffer.serviceId) : null;
  return {
    studio: "Lumen & Co. Photography",
    customerName: mine.name.split(" ")[0],
    status: mine.status,
    soldElsewhere,
    messages: mine.messages,
    offer: mine.currentOffer ? { ...mine.currentOffer, serviceDescription: svc?.description ?? "" } : null,
    offers: mine.offers,
    waitingForAgent: mine.needsAgent,
  };
}

export async function moveBooking(input: { bookingId: string; photographerId: string; startAt: string }) {
  const db = getDb();
  const [b] = await db.select().from(t.bookings).where(eq(t.bookings.id, input.bookingId));
  if (!b) throw new Error(`No booking ${input.bookingId}.`);
  if (b.status !== "confirmed") throw new Error(`Only confirmed bookings can move (this one is ${b.status}).`);
  const r = await checkSlot(input.photographerId, b.serviceId, input.startAt, b.id);
  if (!r.ok) return { ok: false, reason: r.reason };
  await db.update(t.bookings).set({ photographerId: input.photographerId, startAt: r.startAt, endAt: r.endAt, updatedAt: now() }).where(eq(t.bookings.id, b.id));
  return { ok: true, startAt: r.startAt, endAt: r.endAt };
}

export async function cancelBooking(bookingId: string) {
  const db = getDb();
  const [b] = await db.select().from(t.bookings).where(eq(t.bookings.id, bookingId));
  if (!b) throw new Error(`No booking ${bookingId}.`);
  if (b.status === "cancelled") return { ok: true, already: true };
  await db.update(t.bookings).set({ status: "cancelled", cancelledAt: now(), updatedAt: now() }).where(eq(t.bookings.id, b.id));
  return { ok: true, freed: fmtSlot(b.startAt, b.endAt), customer: b.customerName };
}

export async function schedule() {
  const { photographers, services } = await studio();
  const rows = await getDb().select().from(t.bookings);
  const nowMs = Date.now();
  const openings = await computeOpenings();
  const win = scheduleWindow();
  const db = getDb();
  const liveOffers = await db.select().from(t.offers).where(inArray(t.offers.status, ["proposed", "checkout"]));
  const contactRows = await db.select().from(t.contacts);
  return {
    window: win,
    resources: photographers.map((p) => ({ id: p.id, name: p.name, specialty: p.specialty })),
    services: services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, price: money(s.priceCents), deposit: money(s.depositCents) })),
    bookings: rows
      .filter((b) => b.status === "confirmed" || b.status === "cancelled" || (b.status === "held" && Date.parse(b.holdExpiresAt) > nowMs))
      .map((b) => ({
        id: b.id,
        resourceId: b.photographerId,
        name: b.customerName,
        service: services.find((s) => s.id === b.serviceId)?.name ?? "",
        startAt: b.startAt,
        endAt: b.endAt,
        status: b.status,
        source: b.source,
      })),
    openings,
    offers: liveOffers.map((o) => ({
      id: o.id,
      resourceId: o.photographerId,
      name: contactRows.find((c) => c.id === o.contactId)?.name ?? "Customer",
      service: services.find((s) => s.id === o.serviceId)?.name ?? "",
      version: o.version,
      startAt: o.startAt,
      endAt: o.endAt,
      status: o.status,
      campaignId: o.campaignId,
    })),
  };
}

/** The studio's customer list for the Customers grid: consent, preferences, booking history and DayCloser outreach per contact. */
export async function customers() {
  await ensureSeeded();
  const db = getDb();
  const { photographers, services } = await studio();
  const [contacts, bookings, invs, offers, campaigns] = await Promise.all([
    db.select().from(t.contacts),
    db.select().from(t.bookings),
    db.select().from(t.invitations),
    db.select().from(t.offers),
    db.select().from(t.campaigns),
  ]);
  const nowMs = Date.now();
  const svcName = (id: string) => services.find((s) => s.id === id)?.name ?? "";
  const phName = (id: string) => photographers.find((p) => p.id === id)?.name ?? "";
  return contacts
    .map((ct) => {
      const mine = bookings.filter((b) => b.contactId === ct.id || (!b.contactId && b.customerName === ct.name));
      const upcoming = mine
        .filter((b) => b.status === "confirmed" && Date.parse(b.endAt) > nowMs)
        .sort((a, b) => a.startAt.localeCompare(b.startAt));
      const myInvs = invs.filter((i) => i.contactId === ct.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const latest = myInvs[0];
      const latestOffers = latest ? offers.filter((o) => o.invitationId === latest.id).sort((a, b) => b.version - a.version) : [];
      const offer = latestOffers.find((o) => o.status !== "superseded") ?? latestOffers[0];
      const camp = latest ? campaigns.find((c) => c.id === latest.campaignId) : undefined;
      const paid = offers.filter((o) => o.contactId === ct.id && o.status === "paid");
      let outreach = "Not contacted";
      if (!ct.optedIn) outreach = "Opted out";
      else if (latest) {
        if (offer?.status === "paid") outreach = "Booked by DayCloser";
        else if (camp?.status === "won") outreach = "Opening went to someone else";
        else if (latest.status === "declined") outreach = "Declined";
        else if (offer?.status === "checkout") outreach = "Paying deposit";
        else if (latest.lastReplyAt) outreach = `Replied · offer v${offer?.version ?? 1}`;
        else outreach = `Invited · offer v${offer?.version ?? 1}`;
      }
      return {
        id: ct.id,
        name: ct.name,
        email: ct.email,
        optedIn: !!ct.optedIn,
        segment: ct.optedIn ? "Opted in to studio openings" : "Not opted in (never contacted)",
        service: svcName(ct.preferredServiceId),
        photographer: phName(ct.preferredPhotographerId),
        days: parse<string[]>(ct.preferredDays, []).join(", "),
        times: parse<string[]>(ct.preferredTimes, []).join(", "),
        lastSessionAt: ct.lastSessionAt,
        nextBooking: upcoming[0] ? fmtSlot(upcoming[0].startAt, upcoming[0].endAt) : "",
        outreach,
        offer: offer ? `${svcName(offer.serviceId)} · ${phName(offer.photographerId)} · ${fmtSlot(offer.startAt, offer.endAt)}` : "",
        depositsPaid: paid.reduce((s, o) => s + o.depositCents, 0) / 100,
        token: latest && ct.optedIn ? latest.token : "",
        notes: ct.notes,
      };
    })
    .sort((a, b) => Number(b.optedIn) - Number(a.optedIn) || a.name.localeCompare(b.name));
}
