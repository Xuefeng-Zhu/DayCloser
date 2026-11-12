import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";

import "@/components/daycloser/daycloser.css";

type Thread = {
  studio: string;
  customerName: string;
  status: string;
  soldElsewhere: boolean;
  waitingForAgent: boolean;
  paypalReady: boolean;
  messages: { id: string; role: string; body: string; offerVersion: number | null; at: string }[];
  offer: null | { id: string; version: number; status: string; service: string; serviceDescription: string; photographer: string; slot: string; price: string; deposit: string; paypalCaptureId: string };
};

export function meta() {
  return [{ title: "Your opening at Lumen & Co. Photography" }, { name: "robots", content: "noindex" }];
}

/** The customer's side: the invitation they never asked for, a reply box, and the PayPal deposit button. */
export default function OfferRoute() {
  const { token = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"" | "reply" | "pay" | "capture">("");
  const captured = useRef(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/public/offer/${token}`);
    if (!r.ok) {
      setError((await r.json().catch(() => ({})))?.statusMessage ?? "This link is not valid.");
      return;
    }
    setThread(await r.json());
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);

  // Back from PayPal: capture once, server-side.
  useEffect(() => {
    const ret = params.get("paypal");
    const orderId = params.get("token");
    if (ret === "return" && orderId && !captured.current) {
      captured.current = true;
      setBusy("capture");
      fetch(`/api/public/offer/${token}/capture`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) })
        .then(async (r) => {
          if (!r.ok) setError((await r.json().catch(() => ({})))?.statusMessage ?? "Payment could not be captured.");
        })
        .finally(() => {
          setBusy("");
          setParams({}, { replace: true });
          load();
        });
    } else if (ret === "cancel" && !captured.current) {
      captured.current = true;
      fetch(`/api/public/offer/${token}/cancel`, { method: "POST" }).finally(() => {
        setParams({}, { replace: true });
        load();
      });
    }
  }, [params, token, load, setParams]);

  async function sendReply() {
    if (!draft.trim()) return;
    setBusy("reply");
    setError("");
    const r = await fetch(`/api/public/offer/${token}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: draft }) });
    if (!r.ok) setError((await r.json().catch(() => ({})))?.statusMessage ?? "Could not send.");
    else setDraft("");
    setBusy("");
    load();
  }

  async function pay() {
    setBusy("pay");
    setError("");
    const r = await fetch(`/api/public/offer/${token}/checkout`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.approveUrl) {
      setError(j?.statusMessage ?? "Could not start PayPal checkout.");
      setBusy("");
      return;
    }
    window.location.href = j.approveUrl;
  }

  if (error && !thread) return <Shell><p className="text-sm text-red-700">{error}</p></Shell>;
  if (!thread) return <Shell><p className="text-sm text-zinc-500">Loading…</p></Shell>;
  const booked = thread.status === "booked";
  const o = thread.offer;
  const canPay = !!o && !booked && !thread.soldElsewhere && ["proposed", "checkout"].includes(o.status) && !thread.waitingForAgent;

  return (
    <Shell studio={thread.studio}>
      <h1 className="text-lg font-semibold">Hi {thread.customerName},</h1>
      <div className="mt-3 space-y-2 text-[15px]">
        {thread.messages.map((m) => (
          <div key={m.id} className={m.role === "customer" ? "flex justify-end" : "flex"}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${m.role === "customer" ? "bg-zinc-900 text-white" : m.role === "system" ? "bg-emerald-50 text-emerald-900" : "bg-zinc-100 text-zinc-900"}`}>{m.body}</div>
          </div>
        ))}
        {thread.waitingForAgent && (
          <div className="flex">
            <div className="dc-pulse rounded-2xl bg-zinc-100 px-3 py-2 text-zinc-500">The studio is checking the calendar…</div>
          </div>
        )}
      </div>

      {o && !thread.soldElsewhere && (
        <div className={`mt-5 rounded-2xl border p-4 ${booked ? "border-emerald-500 bg-emerald-50" : "border-zinc-200"}`}>
          <div className="flex items-baseline justify-between">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{booked ? "You're booked" : `Your offer${o.version > 1 ? ` (updated, v${o.version})` : ""}`}</div>
            <div className="text-xs text-zinc-500">{o.price} total</div>
          </div>
          <div className="mt-1 text-base font-semibold">{o.service} with {o.photographer}</div>
          <div className="text-[15px]">{o.slot} (Pacific)</div>
          <div className="mt-1 text-xs text-zinc-500">{o.serviceDescription}</div>
          {booked ? (
            <div className="mt-3 text-sm text-emerald-800">Deposit {o.deposit} paid with PayPal{o.paypalCaptureId ? ` · ref ${o.paypalCaptureId}` : ""}. See you then!</div>
          ) : (
            <button
              onClick={pay}
              disabled={!canPay || busy !== "" || !thread.paypalReady}
              className="mt-3 w-full rounded-full bg-[#ffc439] px-4 py-2.5 text-[15px] font-semibold text-[#111] hover:brightness-95 disabled:opacity-50"
            >
              {busy === "pay" ? "Opening PayPal…" : busy === "capture" ? "Confirming payment…" : `Pay ${o.deposit} deposit with PayPal`}
            </button>
          )}
          {!thread.paypalReady && !booked && <div className="mt-2 text-xs text-red-700">PayPal sandbox is not configured on this server.</div>}
        </div>
      )}
      {thread.soldElsewhere && <div className="mt-4 rounded-xl bg-zinc-100 p-3 text-sm">This opening has been booked. We'll be in touch when another time fits.</div>}
      {error && <div className="mt-3 text-sm text-red-700">{error}</div>}

      {!booked && !thread.soldElsewhere && thread.status !== "declined" && (
        <div className="mt-5">
          <label className="text-xs text-zinc-500">Doesn't quite work? Reply and we'll adjust.</label>
          <div className="mt-1 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendReply()}
              placeholder="e.g. Could we do later in the afternoon?"
              className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-[15px] outline-none focus:border-zinc-900"
            />
            <button onClick={sendReply} disabled={busy !== "" || !draft.trim()} className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
              Send
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, studio = "Lumen & Co. Photography" }: { children: React.ReactNode; studio?: string }) {
  return (
    <div className="min-h-screen bg-[#f6f5f2] px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center gap-2 text-sm text-zinc-600">
          <span className="dc-logo">◐</span> {studio}
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm">{children}</div>
        <div className="mt-3 text-center text-[11px] text-zinc-400">You're receiving this because you opted in to studio openings. Sent by DayCloser.</div>
      </div>
    </div>
  );
}
