import { subscribe, unsubscribe } from "@agent-native/core/event-bus";
import { defineNitroPlugin, startIntervalJob } from "@agent-native/core/server";

import { refreshMerchantDashboard } from "../daycloser/merchant.js";
import { reconcilePendingPayments } from "../daycloser/paypal.js";
import {
  claimJob,
  deferJob,
  failJob,
  finishJob,
} from "../daycloser/repository.js";
import { runSalesJob, salesModelReady } from "../daycloser/sales-agent.js";
import { dayCloserEvents } from "../daycloser/signals.js";

export default defineNitroPlugin((nitro) => {
  if (process.env.DAYCLOSER_WORKER === "0") return; // guard:allow-env-credential — Deployment-level worker enable switch.
  const shutdown = new AbortController();
  let active: Promise<void> | undefined;

  async function runNext(signal: AbortSignal) {
    if (!salesModelReady()) return;
    const job = await claimJob();
    if (!job) return;
    try {
      const result = await runSalesJob(job, signal);
      if (result === "defer") await deferJob(job.id, job.leaseToken);
      else await finishJob(job.id, job.leaseToken);
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.warn(
          "[daycloser] Sales job diagnostic",
          error instanceof Error ? error.name : "Unknown failure",
        );
      const reason =
        error instanceof Error && error.message.startsWith("The agent did not")
          ? "The agent did not deliver a message. Retrying."
          : "The sales run could not finish. Retrying.";
      await failJob(job.id, job.leaseToken, reason);
    }
    refreshMerchantDashboard();
  }

  function tick() {
    if (active || shutdown.signal.aborted) return active;
    const signal = AbortSignal.any([
      shutdown.signal,
      AbortSignal.timeout(75_000),
    ]);
    active = runNext(signal)
      .catch(() =>
        console.error("[daycloser] Sales worker could not check the queue."),
      )
      .finally(() => {
        active = undefined;
      });
    return active;
  }

  const listeners = dayCloserEvents.map((event) =>
    subscribe(event, () => {
      void tick();
    }),
  );
  const sales = startIntervalJob(
    async () => {
      await tick();
    },
    { intervalMs: 4000, timeoutMs: 80_000, leading: false },
  );
  const payments = startIntervalJob(
    async () => {
      await reconcilePendingPayments();
    },
    {
      intervalMs: 15_000,
      timeoutMs: 60_000,
      leading: false,
      onError: () =>
        console.error("[daycloser] PayPal reconciliation will retry."),
    },
  );

  nitro.hooks.hook("close", async () => {
    shutdown.abort();
    listeners.forEach(unsubscribe);
    await Promise.all([sales.stop(), payments.stop(), active]);
  });
});
