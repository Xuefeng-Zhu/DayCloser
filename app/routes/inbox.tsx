import { IconSend } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Brand } from "@/daycloser/brand";
import { customerRequest, CustomerApiError } from "@/daycloser/customer-api";
import type { Inbox } from "@/daycloser/customer-api";
import { CustomerOffer } from "@/daycloser/customer-offer";
import { dateTime } from "@/daycloser/format";

import "@/daycloser/daycloser.css";

export const meta = () => [
  { title: "Demo customer inbox · DayCloser" },
  { name: "referrer", content: "no-referrer" },
  { name: "robots", content: "noindex, nofollow" },
];

const sessionKey = "daycloser.inbox-session";

export default function CustomerInbox() {
  const [token, setToken] = useState<string | null>();
  useEffect(() => {
    function readLink() {
      const newToken = window.location.hash.slice(1);
      if (newToken) {
        try {
          window.sessionStorage.setItem(sessionKey, newToken);
          window.history.replaceState(
            window.history.state,
            "",
            `${window.location.pathname}${window.location.search}`,
          );
        } catch {
          // The invitation still works if browser storage is restricted.
        }
        setToken(newToken);
      } else {
        try {
          setToken(window.sessionStorage.getItem(sessionKey));
        } catch {
          setToken(null);
        }
      }
    }
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, []);
  return (
    <div className="dc-shell dc-inbox-shell">
      {token ? (
        <Conversation key={token} token={token} />
      ) : (
        <main className="dc-inbox-main">
          <header className="dc-inbox-header">
            <Brand name="Northlight Studio" />
          </header>
          <p className="dc-inbox-label">Demo customer inbox</p>
          {token === undefined ? (
            <p className="dc-load-state" role="status">
              Opening your inbox…
            </p>
          ) : (
            <p className="dc-load-state">
              Open the invitation from the studio to see your conversation.
            </p>
          )}
        </main>
      )}
    </div>
  );
}

function Conversation({ token }: { token: string }) {
  const inbox = useQuery({
    queryKey: ["daycloser-customer", token],
    queryFn: ({ signal }) => customerRequest<Inbox>(token, undefined, signal),
    refetchInterval: (query) =>
      query.state.error instanceof CustomerApiError &&
      query.state.error.status < 500
        ? false
        : 2_500,
    retry: false,
    staleTime: 1_000,
    gcTime: 0,
  });
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const request = useRef<{ body: string; requestId: string }>(null);
  const { refetch } = inbox;
  const refresh = useCallback(() => refetch(), [refetch]);
  const data = inbox.data;
  const inaccessible =
    inbox.error instanceof CustomerApiError &&
    [401, 403, 404, 410].includes(inbox.error.status);

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    const payload =
      request.current?.body === body
        ? request.current
        : { body, requestId: crypto.randomUUID() };
    request.current = payload;
    setError(undefined);
    setSending(true);
    try {
      await customerRequest(token, { route: "reply", body: payload });
      request.current = null;
      setDraft("");
    } catch (error) {
      setError(
        error instanceof CustomerApiError
          ? error.message
          : "Your reply couldn’t be sent. Please try again.",
      );
    } finally {
      setSending(false);
      await refresh();
    }
  }

  async function acceptOffer(offerId: string) {
    setError(undefined);
    setAccepting(true);
    try {
      await customerRequest(token, { route: "accept", body: { offerId } });
    } catch (error) {
      setError(
        error instanceof CustomerApiError
          ? error.message
          : "The studio couldn’t hold this time. Please try again.",
      );
    } finally {
      await refresh();
      setAccepting(false);
    }
  }

  const showHold =
    data?.hold &&
    ((data.hold.status !== "expired" && data.hold.status !== "refunded") ||
      !data.offer ||
      data.offer.id === data.hold.snapshot.id)
      ? data.hold
      : null;
  const offer = showHold?.snapshot ?? data?.offer;
  const timezone = data?.studio.timezone ?? "America/Los_Angeles";

  return (
    <main className="dc-inbox-main">
      <header className="dc-inbox-header">
        <Brand name={data?.studio.name ?? "Northlight Studio"} />
      </header>
      <p className="dc-inbox-label">Demo customer inbox</p>
      <h1>Your studio conversation</h1>
      {inaccessible ? (
        <p className="dc-load-state" role="status">
          This invitation is unavailable. Ask the studio for a new link.
        </p>
      ) : data ? (
        <>
          <p className="dc-inbox-from">
            {data.resource.name} from {data.studio.name}
          </p>
          {data.messages.length > 0 ? (
            <ol
              className="dc-thread"
              aria-label="Messages"
              aria-live="polite"
              aria-relevant="additions"
            >
              {data.messages.map((message) => {
                const author =
                  message.role === "customer"
                    ? data.customer.name
                    : data.studio.name;
                return (
                  <li
                    className={`dc-message dc-message-${message.role}`}
                    key={message.id}
                  >
                    <span className="dc-avatar" aria-hidden="true">
                      {author.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <strong>{author}</strong>
                      <time dateTime={message.createdAt}>
                        {dateTime(message.createdAt, timezone)}
                      </time>
                      <p>{message.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="dc-load-state">
              Your invitation will appear here when the studio sends it.
            </p>
          )}
          {offer && (
            <CustomerOffer
              offer={offer}
              hold={showHold}
              resourceName={data.resource.name}
              timezone={timezone}
              token={token}
              paypalClientId={data.paypalClientId}
              accepting={accepting}
              onAccept={() => void acceptOffer(offer.id)}
              onUpdate={refresh}
            />
          )}
          {error && (
            <p className="dc-inline-error" role="alert">
              {error}
            </p>
          )}
          {inbox.isError && (
            <p className="dc-inline-error" role="status">
              Connection lost. Reconnecting…
            </p>
          )}
          {data.messages.length > 0 && (
            <form
              className="dc-reply"
              onSubmit={(event) => void submitReply(event)}
            >
              <textarea
                aria-label="Type your reply"
                placeholder="Type your reply…"
                value={draft}
                rows={2}
                maxLength={2000}
                onChange={(event) => setDraft(event.target.value)}
                disabled={sending}
                required
              />
              <button
                type="submit"
                className="dc-button dc-button-primary"
                disabled={sending || !draft.trim()}
              >
                <IconSend size={17} aria-hidden="true" />{" "}
                {sending ? "Sending…" : "Send"}
              </button>
            </form>
          )}
        </>
      ) : inbox.isError ? (
        <div className="dc-load-state" role="alert">
          <p>The studio inbox couldn’t load.</p>
          <button
            type="button"
            className="dc-button dc-button-secondary"
            onClick={() => void refresh()}
          >
            Try again
          </button>
        </div>
      ) : (
        <p className="dc-load-state" role="status">
          Loading your conversation…
        </p>
      )}
    </main>
  );
}
