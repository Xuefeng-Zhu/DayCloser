import { randomUUID } from "node:crypto";
import { closeDbExec, withMigrationRuntime } from "@agent-native/core/db";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../server/db/index.js";
import * as tables from "../server/db/schema.js";
import migrate from "../server/plugins/db.js";
import * as repo from "../server/daycloser/repository.js";

// guard:allow-env-credential — Disposable PostgreSQL connection for integration tests.
const databaseUrl = process.env.DAYCLOSER_TEST_DATABASE_URL;
const testPostgres = databaseUrl ? describe : describe.skip;
const day = "2030-02-05";
const clock = new Date("2030-02-05T19:00:00.000Z");
const at = (minutes: number) => new Date(+clock + minutes * 60_000);
const starts = { first: day + "T22:00:00.000Z", revised: day + "T22:30:00.000Z" };
const studioIds: string[] = [];

async function scenario() {
  const studioId = "daycloser-test-" + randomUUID();
  studioIds.push(studioId);
  await repo.seedStudio(studioId, { demoDate: day, now: clock });
  const dashboard = await repo.getMerchantDashboard(studioId, clock);
  const maya = dashboard.resources.find(({ name }) => name === "Maya")!;
  const opening = dashboard.openings.find(
    ({ resourceId, startAt }) => resourceId === maya.id && startAt === starts.first,
  )!;
  return { studioId, dashboard, maya, opening };
}

async function outreach(s: Awaited<ReturnType<typeof scenario>>) {
  const proposal = await repo.proposeCampaign(s.studioId, s.opening.id, clock);
  const campaign = await repo.approveCampaign(
    s.studioId,
    proposal.id,
    proposal.policy.version,
    clock,
  );
  const job = await repo.claimJob(clock);
  expect(job?.payload).toEqual({ kind: "outreach", studioId: s.studioId, campaignId: campaign.id });
  return { campaign, job: job! };
}

async function invitation(
  studioId: string,
  job: repo.ClaimedJob,
  customerId: string,
  serviceId = "standard-headshot",
  startAt = starts.first,
) {
  const offer = await repo.sendOffer(
    job,
    { customerId, serviceId, startAt, body: "Would a new professional portrait be useful?" },
    clock,
  );
  const dashboard = await repo.getMerchantDashboard(studioId, clock);
  const conversation = dashboard.conversations.find((entry) => entry.customer.id === customerId)!;
  const token = await repo.createCustomerInboxToken(studioId, conversation.id);
  return { offer, token, conversation };
}

async function reserve(s: Awaited<ReturnType<typeof scenario>>, both = false) {
  const { campaign, job } = await outreach(s);
  const invited = await invitation(
    s.studioId,
    job,
    campaign.policy.contacts[0]!.id,
    "express-headshot",
    starts.revised,
  );
  const competing = both
    ? await invitation(
        s.studioId,
        job,
        campaign.policy.contacts[1]!.id,
        "express-headshot",
        starts.revised,
      )
    : undefined;
  await repo.finishJob(job.id, job.leaseToken);
  return { campaign, invited, competing };
}

testPostgres("DayCloser PostgreSQL domain", () => {
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !["postgresql:", "postgres:"].includes(url.protocol) ||
      !url.pathname.toLowerCase().endsWith("_test")
    ) {
      throw new Error(
        "DAYCLOSER_TEST_DATABASE_URL must name a dedicated PostgreSQL database ending in _test.",
      );
    }
    process.env.DATABASE_URL = databaseUrl;
    await withMigrationRuntime(() => migrate(null));
  });

  afterAll(async () => {
    if (studioIds.length)
      await getDb().delete(tables.studios).where(inArray(tables.studios.id, studioIds));
    await closeDbExec();
  });

  it("seeds openings and cancellation capacity, while preserving the next appointment", async () => {
    const s = await scenario();
    expect(s.dashboard.studio).toMatchObject({ timezone: "America/Los_Angeles", demoDate: day });
    expect(s.dashboard.resources.map(({ name }) => name)).toEqual(["Maya", "Jordan"]);
    expect(s.opening).toMatchObject({
      startAt: starts.first,
      endAt: day + "T23:30:00.000Z",
      source: "available",
    });
    expect(s.dashboard.openings.some(({ source }) => source === "cancellation")).toBe(true);
    expect(s.dashboard.appointments).toContainEqual(
      expect.objectContaining({ resourceId: s.maya.id, startAt: s.opening.endAt }),
    );
    expect(s.dashboard.contacts).toHaveLength(8);
    expect(s.dashboard.contacts.map(({ eligibility }) => eligibility)).toContain("opted_out");
    expect(s.dashboard.contacts.map(({ eligibility }) => eligibility)).toContain("already_booked");
    expect(await repo.seedStudio(s.studioId, { demoDate: "2030-02-06", now: clock })).toBe(false);
  });

  it("filters current services and rejects non-fitting or unauthorized offers", async () => {
    const s = await scenario();
    const optedOut = s.dashboard.contacts.find(({ eligibility }) => eligibility === "opted_out")!;
    const unrelated = s.dashboard.contacts.find(
      ({ eligibility }) => eligibility === "unrelated_interest",
    )!;
    await getDb()
      .update(tables.contacts)
      .set({ headshotInterest: true })
      .where(eq(tables.contacts.id, unrelated.id));
    const { campaign, job } = await outreach(s);
    const audience = campaign.policy.contacts;
    expect(audience[0]!.name).toBe("Alex Morgan");
    expect(audience).toHaveLength(4);
    const options = await repo.getCampaignOptions(
      s.studioId,
      campaign.id,
      {
        earliestStartAt: starts.revised,
        budgetCents: 11_000,
        minimumPhotos: 2,
      },
      clock,
    );
    expect(options[0]).toMatchObject({
      startAt: starts.revised,
      shootingEndAt: day + "T23:00:00.000Z",
      endAt: day + "T23:10:00.000Z",
      service: { id: "express-headshot", priceCents: 10_000 },
    });
    expect(options.every(({ service }) => service.id === "express-headshot")).toBe(true);
    await expect(invitation(s.studioId, job, optedOut.id)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      invitation(s.studioId, job, audience[0]!.id, "invented-service"),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      invitation(s.studioId, job, audience[0]!.id, "standard-headshot", starts.revised),
    ).rejects.toMatchObject({ statusCode: 409 });
    const standard = campaign.policy.services.find(({ id }) => id === "standard-headshot")!;
    const scopedService = and(
      eq(tables.services.studioId, s.studioId),
      eq(tables.services.id, standard.id),
    );
    await getDb()
      .update(tables.services)
      .set({ details: { ...standard, priceCents: 17_500 } })
      .where(scopedService);
    await expect(invitation(s.studioId, job, audience[0]!.id)).rejects.toMatchObject({
      statusCode: 403,
    });
    await getDb().update(tables.services).set({ details: standard }).where(scopedService);
    for (const contact of audience.slice(0, 3)) await invitation(s.studioId, job, contact.id);
    await expect(invitation(s.studioId, job, audience[3]!.id)).rejects.toMatchObject({
      statusCode: 409,
    });
    await repo.finishJob(job.id, job.leaseToken);
  });

  it("persists initial outreach and deduplicates a free-text reply before revising the offer", async () => {
    const s = await scenario();
    const { campaign, job } = await outreach(s);
    const { token, offer } = await invitation(s.studioId, job, campaign.policy.contacts[0]!.id);
    await repo.finishJob(job.id, job.leaseToken);
    const view = await repo.readCustomer(token, clock);
    expect(view.messages).toHaveLength(1);
    expect(view.messages[0]).toMatchObject({ role: "studio", offerId: offer.id });
    const body =
      "I can't get there until 2:30, and my budget is around $110. I only need two photos for LinkedIn.";
    await repo.submitCustomerReply(token, body, "request-12345", at(1));
    await repo.submitCustomerReply(token, body, "request-12345", at(2));
    const reply = (await repo.claimJob(at(2)))!;
    expect((await repo.getJobContext(reply, at(2))).message?.body).toBe(body);
    const revised = await repo.reviseOffer(
      reply,
      { serviceId: "express-headshot", startAt: starts.revised, body: "A shorter session fits." },
      at(2),
    );
    expect(revised).toMatchObject({
      priceCents: 10_000,
      depositCents: 3000,
      remainingCents: 7000,
      editedPhotos: 2,
    });
    expect(await repo.jobHasOutcome(reply)).toBe(true);
    const after = await repo.readCustomer(token, at(2));
    expect(after.offers).toContainEqual(
      expect.objectContaining({ id: offer.id, status: "superseded" }),
    );
    expect(after.messages.filter(({ role }) => role === "customer")).toHaveLength(1);
    await repo.finishJob(reply.id, reply.leaseToken);
    expect(await repo.claimJob(at(3))).toBeUndefined();
  });

  it("serializes competing PostgreSQL claims and scopes holds to the customer token", async () => {
    const s = await scenario();
    const { invited, competing } = await reserve(s, true);
    const results = await Promise.allSettled([
      repo.acceptOffer(invited.token, invited.offer.id, at(1)),
      repo.acceptOffer(competing!.token, competing!.offer.id, at(1)),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.find(({ status }) => status === "rejected")).toMatchObject({
      reason: { statusCode: 409 },
    });
    await expect(repo.acceptOffer(invited.token, competing!.offer.id, at(1))).rejects.toMatchObject(
      { statusCode: 404 },
    );
    await expect(
      repo.createCustomerInboxToken("other-studio", invited.conversation.id),
    ).rejects.toMatchObject({ statusCode: 404 });
    const forgedToken = competing!.conversation.id + "." + invited.token.split(".")[1];
    await expect(repo.readCustomer(forgedToken, at(1))).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects late capture on expired holds and allows a competing customer to claim it", async () => {
    const s = await scenario();
    const { invited, competing } = await reserve(s, true);
    const hold = await repo.acceptOffer(invited.token, invited.offer.id, at(1));
    const { attempt } = await repo.getOrCreatePayment(
      invited.token,
      hold.id,
      "FIXTURE-MERCHANT",
      at(1),
    );
    const orderId = randomUUID();
    await repo.bindPaymentOrder(attempt.id, orderId);
    await expect(
      repo.beginPaymentCapture(invited.token, hold.id, orderId, at(7)),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      repo.acceptOffer(competing!.token, competing!.offer.id, at(7)),
    ).resolves.toMatchObject({ status: "held" });
  });

  it("keeps capture pending past hold expiry and converges duplicate provider events on one booking", async () => {
    const s = await scenario();
    const { invited, competing } = await reserve(s, true);
    const hold = await repo.acceptOffer(invited.token, invited.offer.id, at(1));
    const { attempt } = await repo.getOrCreatePayment(
      invited.token,
      hold.id,
      "FIXTURE-MERCHANT",
      at(1),
    );
    const orderId = randomUUID();
    await repo.bindPaymentOrder(attempt.id, orderId);
    const attempts = await Promise.all([
      repo.beginPaymentCapture(invited.token, hold.id, orderId, at(5)),
      repo.beginPaymentCapture(invited.token, hold.id, orderId, at(5)),
    ]);
    expect(attempts.filter(({ started }) => started)).toHaveLength(1);
    await expect(
      repo.acceptOffer(competing!.token, competing!.offer.id, at(8)),
    ).rejects.toMatchObject({ statusCode: 409 });
    const capture = {
      orderId,
      captureId: randomUUID(),
      status: "COMPLETED",
      currency: "USD",
      amountCents: 3_000,
      merchantId: attempt.payeeMerchantId,
      referenceId: attempt.id,
    };
    const webhook = randomUUID();
    const results = await Promise.all([
      repo.finalizePayment(capture, webhook, at(9)),
      repo.finalizePayment(capture, webhook, at(9)),
      repo.finalizePayment(capture, undefined, at(9)),
    ]);
    expect(results.every(({ status }) => status === "booked")).toBe(true);
    expect(results.filter(({ changed }) => changed)).toHaveLength(1);
    const dashboard = await repo.getMerchantDashboard(s.studioId, at(9));
    expect(dashboard.totals).toEqual({
      bookedValueCents: 10_000,
      depositsCollectedCents: 3_000,
      outstandingBalanceCents: 7_000,
      occupiedMinutes: 40,
      shootingMinutes: 30,
      bufferMinutes: 10,
    });
    expect(
      dashboard.openings.some(
        ({ resourceId, startAt, endAt }) =>
          resourceId === s.maya.id && startAt === starts.first && endAt === starts.revised,
      ),
    ).toBe(true);
    const view = await repo.readCustomer(invited.token, at(9));
    expect(view.messages.filter(({ role }) => role === "system")).toHaveLength(1);
    expect((await repo.readCustomer(competing!.token, at(9))).offer?.status).toBe("closed");
  });

  it("preserves a mismatched capture for merchant refund without booking", async () => {
    const s = await scenario();
    const { invited } = await reserve(s);
    const hold = await repo.acceptOffer(invited.token, invited.offer.id, at(1));
    const { attempt } = await repo.getOrCreatePayment(
      invited.token,
      hold.id,
      "FIXTURE-MERCHANT",
      at(1),
    );
    const orderId = randomUUID();
    await repo.bindPaymentOrder(attempt.id, orderId);
    await repo.beginPaymentCapture(invited.token, hold.id, orderId, at(2));
    const captureId = randomUUID();
    const result = await repo.finalizePayment(
      {
        orderId,
        captureId,
        status: "COMPLETED",
        currency: "USD",
        amountCents: 3_100,
        merchantId: attempt.payeeMerchantId,
        referenceId: attempt.id,
      },
      randomUUID(),
      at(2),
    );
    expect(result).toMatchObject({ status: "refund_required" });
    expect((await repo.getMerchantDashboard(s.studioId, at(2))).totals.bookedValueCents).toBe(0);
    expect((await repo.getMerchantDashboard(s.studioId, at(2))).refunds).toContainEqual({
      attemptId: attempt.id,
      depositCents: 3100,
      currency: "USD",
    });
    const refund = await repo.getRefundRequiredPayment(s.studioId, attempt.id);
    expect(refund.attempt).toMatchObject({ captureId, capturedAmountCents: 3100 });
    await expect(repo.getRefundRequiredPayment("other-studio", attempt.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    const refundId = randomUUID();
    await repo.markRefundPending(attempt.id, refundId);
    await repo.markRefunded(attempt.id, refundId);
    expect((await repo.readCustomer(invited.token, at(2))).hold?.status).toBe("refunded");
    expect((await repo.getRefundRequiredPayment(s.studioId, attempt.id)).attempt.status).toBe(
      "refunded",
    );
  });

  it("stops new outreach while paused and resumes the same durable job", async () => {
    const s = await scenario();
    const { campaign, job } = await outreach(s);
    await repo.setCampaignPaused(s.studioId, campaign.id, true, at(1));
    await expect(
      repo.sendOffer(
        job,
        {
          customerId: campaign.policy.contacts[0]!.id,
          serviceId: "standard-headshot",
          startAt: starts.first,
          body: "Would a studio headshot be useful?",
        },
        at(1),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    await repo.deferJob(job.id, job.leaseToken, 0, at(1));
    expect(await repo.claimJob(at(2))).toBeUndefined();
    await repo.setCampaignPaused(s.studioId, campaign.id, false, at(2));
    const resumed = await repo.claimJob(at(2));
    expect(resumed?.id).toBe(job.id);
    expect(resumed?.leaseToken).not.toBe(job.leaseToken);
    await repo.finishJob(resumed!.id, resumed!.leaseToken);
  });
});
