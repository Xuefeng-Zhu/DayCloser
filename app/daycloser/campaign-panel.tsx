import { useActionMutation } from "@agent-native/core/client/hooks";
import type { Campaign, MerchantConversation, Opening } from "@shared/daycloser";
import {
  IconArrowUpRight,
  IconChevronDown,
  IconMail,
  IconPlayerPause,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { useState } from "react";
import type { Ref } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { campaignStatusLabels, dateTime, money, time } from "./format";

function DemoInboxLink({ conversation }: { conversation: MerchantConversation }) {
  const [href, setHref] = useState<string>();
  const createLink = useActionMutation("create-customer-inbox-link", {
    onSuccess: (data) => setHref(data.href),
  });
  return (
    <div className="border-t border-border p-2">
      {href ? (
        <Button asChild variant="outline" size="sm" className="w-full whitespace-normal">
          <a href={href} target="_blank" rel="noopener noreferrer">
            Open {conversation.customer.name}’s demo inbox
            <IconArrowUpRight aria-hidden="true" />
          </a>
        </Button>
      ) : (
        <Button
          className="w-full whitespace-normal"
          variant="outline"
          size="sm"
          type="button"
          disabled={createLink.isPending}
          onClick={() => createLink.mutate({ conversationId: conversation.id })}
        >
          <IconMail aria-hidden="true" />
          {createLink.isPending
            ? "Preparing link…"
            : `Prepare ${conversation.customer.name}’s inbox link`}
        </Button>
      )}
    </div>
  );
}

export function CampaignPanel({
  opening,
  photographer,
  campaign,
  conversations,
  timezone,
  headingRef,
  mode = "opening",
}: {
  opening: Opening | undefined;
  photographer: string | undefined;
  campaign: Campaign | undefined;
  conversations: MerchantConversation[];
  timezone: string;
  headingRef?: Ref<HTMLHeadingElement>;
  mode?: "opening" | "campaign";
}) {
  const propose = useActionMutation("propose-campaign");
  const approve = useActionMutation("approve-campaign");
  const pause = useActionMutation("set-campaign-paused");
  const policy = campaign?.policy;

  return (
    <aside
      className="order-2 min-w-0 self-start @min-[58rem]/daycloser:order-none"
      aria-labelledby="dc-campaign-heading"
    >
      <Card className="grid gap-4 border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="dc-campaign-heading"
            className="scroll-mt-4 text-sm font-semibold"
            ref={headingRef}
            tabIndex={-1}
          >
            {mode === "campaign" ? "Campaign details" : "Sell an opening"}
          </h2>
          {campaign && (
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
              {campaignStatusLabels[campaign.status]}
            </span>
          )}
        </div>

        {opening ? (
          <div className="grid gap-1 rounded-md border border-border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
            <strong className="text-sm font-medium text-foreground">
              {photographer} <span>·</span> {time(opening.startAt, timezone)}–
              {time(opening.endAt, timezone)}
            </strong>
            <span>{dateTime(opening.startAt, timezone)}</span>
            {opening.source === "cancellation" && <span>Opened by a cancellation</span>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {mode === "campaign"
              ? "Select a campaign to view its policy and outreach."
              : "Select an opening in the schedule to prepare a campaign."}
          </p>
        )}

        {opening && !campaign && (
          <Button
            type="button"
            className="w-full"
            onClick={() => propose.mutate({ openingId: opening.id })}
            disabled={propose.isPending}
          >
            {propose.isPending ? "Preparing campaign…" : "Sell this opening"}
          </Button>
        )}

        {campaign && policy && (
          <div className="grid gap-3">
            <Separator />
            <h3 className="text-sm font-medium">Campaign policy</h3>
            <dl className="grid gap-2 text-xs leading-relaxed [&>div]:grid [&>div]:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] [&>div]:gap-2 [&_dd]:break-words [&_dt]:text-muted-foreground">
              <div>
                <dt>Eligible customers</dt>
                <dd>{policy.contacts.map((contact) => contact.name).join(", ") || "None"}</dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>Demo customer inboxes for synthetic contacts</dd>
              </div>
              <div>
                <dt>Catalog offers</dt>
                <dd>
                  {policy.services.map((service) => (
                    <span key={service.id} className="block">
                      {service.name} · {money(service.priceCents)}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt>Initial invitations</dt>
                <dd>
                  {campaign.invitationsSent} of {policy.initialInvitationLimit} sent
                </dd>
              </div>
              <div>
                <dt>Follow-ups</dt>
                <dd>Up to {policy.followUpLimit} per contact</dd>
              </div>
              <div>
                <dt>Deposit and hold</dt>
                <dd>
                  {money(policy.depositCents)} · {policy.holdMinutes} minutes
                </dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{dateTime(policy.expiresAt, timezone)}</dd>
              </div>
              <div>
                <dt>Policy version</dt>
                <dd>{policy.version}</dd>
              </div>
            </dl>
            {campaign.status === "proposed" && (
              <Button
                type="button"
                className="w-full"
                disabled={approve.isPending || policy.contacts.length === 0}
                onClick={() =>
                  approve.mutate({
                    campaignId: campaign.id,
                    version: policy.version,
                  })
                }
              >
                {approve.isPending ? "Approving campaign…" : "Approve campaign"}
              </Button>
            )}
            {(campaign.status === "active" || campaign.status === "paused") && (
              <Button
                type="button"
                className="w-full"
                variant="outline"
                disabled={pause.isPending}
                onClick={() =>
                  pause.mutate({
                    campaignId: campaign.id,
                    paused: campaign.status === "active",
                  })
                }
              >
                {campaign.status === "active" ? (
                  <IconPlayerPause size={16} aria-hidden="true" />
                ) : (
                  <IconPlayerPlay size={16} aria-hidden="true" />
                )}
                {campaign.status === "active" ? "Pause outreach" : "Resume outreach"}
              </Button>
            )}
          </div>
        )}

        {conversations.length > 0 && (
          <section className="grid gap-2">
            <Separator />
            <h3 className="mt-1 text-sm font-medium">Customer conversations</h3>
            {conversations.map((conversation) => (
              <details
                key={conversation.id}
                className="group min-w-0 rounded-md border border-border"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  <span>
                    {conversation.customer.name}
                    {conversation.hold?.status === "booked" ? " · Deposit paid" : ""}
                  </span>
                  <IconChevronDown
                    className="size-4 shrink-0 text-muted-foreground group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <ol
                  aria-label={`Conversation with ${conversation.customer.name}`}
                  className="grid gap-3 border-t border-border px-3 py-3 text-sm"
                >
                  {conversation.messages.map((message) => (
                    <li key={message.id}>
                      <strong className="font-medium">
                        {message.role === "customer"
                          ? conversation.customer.name
                          : "Northlight Studio"}
                      </strong>
                      <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-muted-foreground">
                        {message.body}
                      </p>
                    </li>
                  ))}
                </ol>
                <DemoInboxLink conversation={conversation} />
              </details>
            ))}
          </section>
        )}

        {conversations.length === 0 && campaign?.status === "active" && (
          <p className="border-t border-border pt-3 text-sm text-muted-foreground">
            Customer links appear after the invitation reaches a demo inbox.
          </p>
        )}
      </Card>
    </aside>
  );
}
