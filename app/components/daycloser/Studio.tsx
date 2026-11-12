import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import type { SchedulePayload } from "./StudioScheduler";
import "./daycloser.css";

const StudioScheduler = lazy(() => import("./StudioScheduler"));

const TZ = "America/Los_Angeles";
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts }).format(new Date(iso));
const slot = (s: string, e: string) => `${fmt(s, { weekday: "short", month: "short", day: "numeric" })}, ${fmt(s, { hour: "numeric", minute: "2-digit" })}–${fmt(e, { hour: "numeric", minute: "2-digit" })}`;
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

type Offer = { id: string; version: number; status: string; service: string; photographer: string; slot: string; price: string; deposit: string; rationale: string; paypalOrderId: string; paypalCaptureId: string };
type Invitation = {
  id: string;
  name: string;
  status: string;
  needsAgent: boolean;
  link: string;
  messages: { id: string; role: string; body: string; offerVersion: number | null; at: string }[];
  offers: Offer[];
  currentOffer: Offer | null;
};
type Campaign = {
  id: string;
  status: string;
  origin: string;
  opening: { photographer: string; slot: string; startAt: string; endAt: string };
  invitations: Invitation[];
  activity: { kind: string; text: string; at: string }[];
};

function useClient() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

const STATUS_LABEL: Record<string, string> = {
  selecting: "Choosing customers",
  inviting: "Invitations sent",
  negotiating: "Negotiating",
  awaiting_payment: "In PayPal checkout",
  won: "Booked & paid",
  closed: "Closed",
  invited: "Invited",
  replied: "Replied",
  booked: "Booked",
  declined: "Declined",
};

export default function Studio() {
  const client = useClient();
  const scheduleQ = useActionQuery("list-schedule", {}, { refetchInterval: 4000 });
  const campaignsQ = useActionQuery("list-campaigns", {}, { refetchInterval: 4000 });
  const sell = useActionMutation("sell-opening");
  const move = useActionMutation("move-booking");
  const cancel = useActionMutation("cancel-booking");
  const reset = useActionMutation("reset-demo");
  const [selectedOpening, setSelectedOpening] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const data = scheduleQ.data as SchedulePayload | undefined;
  const campaigns = (campaignsQ.data as any[] | undefined) ?? [];
  const opening = data?.openings.find((o) => o.id === selectedOpening) ?? null;

  useEffect(() => {
    if (!campaignId && campaigns.length) setCampaignId(campaigns[0].id);
  }, [campaigns, campaignId]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const stats = useMemo(() => {
    const ops = data?.openings ?? [];
    const won = data?.bookings.filter((b) => b.source === "daycloser" && b.status === "confirmed").length ?? 0;
    return {
      openings: ops.length,
      cancellations: ops.filter((o) => o.origin === "cancellation").length,
      openHours: Math.round(ops.reduce((m, o) => m + o.minutes, 0) / 6) / 10,
      selling: campaigns.filter((c) => !["won", "closed"].includes(c.status)).length,
      won,
    };
  }, [data, campaigns]);

  async function sellOpening(id: string) {
    const o = data?.openings.find((x) => x.id === id);
    if (!o) return;
    setSelectedOpening(id);
    try {
      const r: any = await sell.mutateAsync({ photographerId: o.photographerId, startAt: o.startAt, endAt: o.endAt });
      setCampaignId(r.campaignId);
      campaignsQ.refetch();
      scheduleQ.refetch();
      if (!r.existing) {
        sendToAgentChat({
          message: `Sell this opening: ${o.label} (${o.origin === "cancellation" ? `freed by ${o.cancelledCustomer}'s cancellation` : "never booked"}). Campaign ${r.campaignId}, photographer ${o.photographerId}, ${o.startAt} to ${o.endAt}.`,
          submit: true,
          openSidebar: true,
        });
      }
    } catch (e) {
      setNotice({ tone: "err", text: (e as Error).message });
    }
  }

  async function onMove(bookingId: string, photographerId: string, startAt: Date) {
    try {
      const r: any = await move.mutateAsync({ bookingId, photographerId, startAt: startAt.toISOString() });
      setNotice(r.ok ? { tone: "ok", text: "Booking moved." } : { tone: "err", text: `Move rejected: ${r.reason}` });
    } catch (e) {
      setNotice({ tone: "err", text: (e as Error).message });
    }
    scheduleQ.refetch();
  }

  async function onCancel(bookingId: string) {
    const r: any = await cancel.mutateAsync({ bookingId });
    setNotice({ tone: "ok", text: r.freed ? `${r.customer} cancelled. ${r.freed} is now a cancellation opening.` : "Already cancelled." });
    scheduleQ.refetch();
  }

  return (
    <div className="dc-root flex h-full min-h-0 flex-col overflow-y-auto">
      <header className="flex flex-wrap items-end justify-between gap-4 px-6 pb-3 pt-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="dc-logo">◐</span>
            <h1 className="text-xl font-semibold tracking-tight">DayCloser</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Lumen &amp; Co. Photography</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Turn open hours into paid bookings.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Stat label="Open hours" value={`${stats.openHours}h`} />
          <Stat label="Openings" value={`${stats.openings}`} sub={`${stats.cancellations} from cancellations`} />
          <Stat label="Selling" value={`${stats.selling}`} />
          <Stat label="Booked by DayCloser" value={`${stats.won}`} />
        </div>
      </header>

      {notice && <div className={`mx-6 mb-2 rounded-md px-3 py-2 text-sm ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`}>{notice.text}</div>}

      <section className="mx-6 rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
          <span>
            <Legend cls="dc-l-open" /> Open (never booked) <Legend cls="dc-l-cancel" /> Cancellation <Legend cls="dc-l-offer" /> Live offer <Legend cls="dc-l-book" /> Booking <Legend cls="dc-l-dc" /> Sold by DayCloser <Legend cls="dc-l-held" /> Held in checkout
          </span>
          <button className="underline-offset-2 hover:underline" onClick={async () => { await reset.mutateAsync({}); setCampaignId(null); setSelectedOpening(null); scheduleQ.refetch(); campaignsQ.refetch(); }}>
            Reset demo
          </button>
        </div>
        <div style={{ height: 238 }}>
          {client && data ? (
            <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading timeline…</div>}>
              <StudioScheduler
                data={data}
                selectedId={selectedOpening}
                onSelectOpening={(id) => setSelectedOpening(id)}
                onSelectBooking={() => setSelectedOpening(null)}
                onMove={onMove}
                onCancelBooking={onCancel}
              />
            </Suspense>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">Loading timeline…</div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 px-6 py-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-3">
          {opening ? (
            <div className="rounded-xl border bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{opening.origin === "cancellation" ? "Cancellation opening" : "Never-booked opening"}</div>
              <div className="mt-1 font-medium">{data?.resources.find((r) => r.id === opening.photographerId)?.name}</div>
              <div className="text-sm">{slot(opening.startAt, opening.endAt)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {opening.minutes} minutes free{opening.cancelledCustomer ? ` · freed by ${opening.cancelledCustomer}` : ""}
              </div>
              <button
                className="dc-cta mt-3 w-full"
                disabled={sell.isPending}
                onClick={() => (opening.campaignId ? setCampaignId(opening.campaignId) : sellOpening(opening.id))}
              >
                {opening.campaignId ? "View campaign" : sell.isPending ? "Starting…" : "Sell this opening"}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Click a green opening on the timeline, then <b>Sell this opening</b>. DayCloser picks opted-in customers, invites them, adapts to replies and collects a PayPal deposit.</div>
          )}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Campaigns</div>
            {campaigns.length === 0 && <div className="px-4 py-3 text-sm text-muted-foreground">None yet.</div>}
            {campaigns.map((c) => (
              <button key={c.id} onClick={() => setCampaignId(c.id)} className={`block w-full border-b px-4 py-2 text-left text-sm last:border-0 hover:bg-muted/60 ${c.id === campaignId ? "bg-muted" : ""}`}>
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{c.photographer}</span>
                  <StatusPill status={c.status} />
                </div>
                <div className="text-xs text-muted-foreground">{c.slot}</div>
              </button>
            ))}
          </div>
        </aside>
        <main>{campaignId ? <CampaignPanel id={campaignId} /> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No campaign selected.</div>}</main>
      </div>
    </div>
  );
}

function CampaignPanel({ id }: { id: string }) {
  const q = useActionQuery("get-campaign", { campaignId: id }, { refetchInterval: 2000 });
  const c = q.data as Campaign | undefined;
  useReplyFallback(c);
  if (!c) return <div className="rounded-xl border p-6 text-sm text-muted-foreground">Loading campaign…</div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.origin === "cancellation" ? "Selling a cancellation" : "Selling never-booked time"}</div>
          <div className="font-medium">
            {c.opening.photographer} · {c.opening.slot}
          </div>
        </div>
        <StatusPill status={c.status} big />
      </div>
      {c.invitations.length === 0 && <div className="rounded-xl border p-4 text-sm text-muted-foreground">The agent is choosing who to invite…</div>}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {c.invitations.map((inv) => (
          <InvitationCard key={inv.id} inv={inv} />
        ))}
      </div>
      {c.activity.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Activity</div>
          <ul className="max-h-56 overflow-y-auto text-sm">
            {c.activity.map((a, i) => (
              <li key={i} className="flex gap-3 border-b px-4 py-2 last:border-0">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{ago(a.at)}</span>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InvitationCard({ inv }: { inv: Invitation }) {
  return (
    <div className={`rounded-xl border bg-card ${inv.status === "booked" ? "ring-2 ring-emerald-500" : ""}`}>
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="font-medium">{inv.name}</div>
        <div className="flex items-center gap-2">
          {inv.needsAgent && <span className="dc-pulse rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Agent adapting…</span>}
          <StatusPill status={inv.status} />
          <a className="text-xs text-primary underline-offset-2 hover:underline" href={inv.link} target="_blank" rel="noreferrer">
            Customer view ↗
          </a>
        </div>
      </div>
      {inv.offers.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b px-4 py-2">
          {inv.offers.map((o) => (
            <div key={o.id} className={`rounded-md border px-2 py-1 text-xs ${o.status === "superseded" || o.status === "expired" ? "opacity-50 line-through" : o.status === "paid" ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950" : "border-primary/40 bg-primary/5"}`} title={o.rationale}>
              <b>v{o.version}</b> {o.service} · {o.photographer} · {o.slot} · {o.deposit} deposit
              {o.status === "paid" && <> · PayPal {o.paypalCaptureId}</>}
            </div>
          ))}
        </div>
      )}
      <div className="max-h-72 space-y-2 overflow-y-auto px-4 py-3 text-sm">
        {inv.messages.map((m) => (
          <div key={m.id} className={m.role === "customer" ? "flex justify-end" : "flex"}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${m.role === "customer" ? "bg-primary text-primary-foreground" : m.role === "system" ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "bg-muted"}`}>
              {m.offerVersion && <div className="mb-0.5 text-[10px] font-semibold uppercase opacity-70">Offer v{m.offerVersion}</div>}
              {m.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Customer replies normally reach the agent through the server-side automation.
 * If none has answered within 25 seconds (e.g. the automation runner is unavailable),
 * the open studio hands the reply to the agent chat once.
 */
function useReplyFallback(c: Campaign | undefined) {
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!c) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const inv of c.invitations) {
      if (!inv.needsAgent) continue;
      const last = [...inv.messages].reverse().find((m) => m.role === "customer");
      if (!last) continue;
      const key = `dc-fwd-${last.id}`;
      if (seen.current.has(key) || sessionStorage.getItem(key)) continue;
      const wait = Math.max(0, 25000 - (Date.now() - Date.parse(last.at)));
      timers.push(
        setTimeout(() => {
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, "1");
          seen.current.add(key);
          sendToAgentChat({
            message: `${inv.name} replied to their invitation (invitation ${inv.id}, campaign ${c.id}): "${last.body}". Adapt the offer.`,
            submit: true,
            openSidebar: true,
          });
        }, wait),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [c]);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function StatusPill({ status, big }: { status: string; big?: boolean }) {
  const tone =
    status === "won" || status === "booked"
      ? "bg-emerald-100 text-emerald-900"
      : status === "awaiting_payment"
        ? "bg-orange-100 text-orange-900"
        : status === "negotiating" || status === "replied"
          ? "bg-amber-100 text-amber-900"
          : status === "closed" || status === "declined"
            ? "bg-zinc-200 text-zinc-700"
            : "bg-sky-100 text-sky-900";
  return <span className={`rounded-full ${big ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"} ${tone}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function Legend({ cls }: { cls: string }) {
  return <span className={`dc-legend ${cls}`} />;
}
