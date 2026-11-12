import type { Contact, MerchantConversation } from "@shared/daycloser";
import { IconSearch } from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const ClientCustomersGrid = lazy(() => import("./customers-grid.client"));

const eligibilityLabels: Record<Contact["eligibility"], string> = {
  eligible: "Eligible",
  opted_out: "Opted out",
  already_booked: "Already booked",
  unrelated_interest: "Different interest",
};

export type CustomerRow = {
  id: string;
  name: string;
  interest: string;
  eligibility: string;
  lastMessageAt: string | null;
};

export function CustomersGrid({
  contacts,
  conversations,
  timezone,
}: {
  contacts: Contact[];
  conversations: MerchantConversation[];
  timezone: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => setMounted(true), []);

  const rows = useMemo(() => {
    const lastMessageByCustomer = new Map<string, string>();
    for (const { customer, messages } of conversations) {
      let latest = lastMessageByCustomer.get(customer.id);
      for (const message of messages) {
        if (message.role !== "system" && (!latest || message.createdAt > latest)) {
          latest = message.createdAt;
        }
      }
      if (latest) lastMessageByCustomer.set(customer.id, latest);
    }

    return contacts.map(
      (contact): CustomerRow => ({
        id: contact.id,
        name: contact.name,
        interest: contact.preference,
        eligibility: eligibilityLabels[contact.eligibility],
        lastMessageAt: lastMessageByCustomer.get(contact.id) ?? null,
      }),
    );
  }, [contacts, conversations]);

  const search = query.trim().toLocaleLowerCase();
  const visibleRows = search
    ? rows.filter(({ name, interest, eligibility }) =>
        [name, interest, eligibility].some((value) => value.toLocaleLowerCase().includes(search)),
      )
    : rows;
  const customerCount = rows.length === 1 ? "1 customer" : `${rows.length} customers`;
  const loading = (
    <div className="p-4" role="status" aria-label="Loading customers">
      <Skeleton className="h-[24rem] w-full" />
    </div>
  );

  return (
    <div className="daycloser-customers-grid min-w-0 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="relative w-full sm:w-64">
          <IconSearch
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search customers"
            placeholder="Search customers"
            className="h-9 pl-9"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground" role="status">
          {search ? `${visibleRows.length} of ${customerCount}` : customerCount}
        </p>
      </div>
      {mounted ? (
        <Suspense fallback={loading}>
          <ClientCustomersGrid
            rows={visibleRows}
            timezone={timezone}
            emptyText={search ? "No customers match your search." : "No customers yet."}
          />
        </Suspense>
      ) : (
        loading
      )}
    </div>
  );
}
