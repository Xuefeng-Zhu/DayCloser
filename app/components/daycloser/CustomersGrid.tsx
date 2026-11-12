import "./bryntum-theme";

import { BryntumGrid } from "@bryntum/calendar-react";
import { useMemo } from "react";

export type CustomerRow = {
  id: string;
  name: string;
  email: string;
  optedIn: boolean;
  segment: string;
  service: string;
  photographer: string;
  days: string;
  times: string;
  lastSessionAt: string;
  nextBooking: string;
  outreach: string;
  offer: string;
  depositsPaid: number;
  token: string;
  campaignId?: string;
  notes: string;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const OUTREACH_TONE = (s: string) =>
  s.startsWith("Booked") ? "dc-pill-won" : s.startsWith("Paying") ? "dc-pill-pay" : s.startsWith("Replied") ? "dc-pill-neg" : s.startsWith("Invited") ? "dc-pill-inv" : s === "Opted out" ? "dc-pill-out" : "dc-pill-idle";

/** The studio's customer list as a Bryntum Grid: grouped by consent, filterable, sortable, with DayCloser outreach status per contact. */
export default function CustomersGrid({ rows }: { rows: CustomerRow[] }) {
  const data = useMemo(() => rows.map((r) => ({ ...r, lastSession: r.lastSessionAt ? new Date(r.lastSessionAt) : null })), [rows]);

  const config = useMemo(
    () => ({
      rowHeight: 52,
      features: {
        group: { field: "segment", ascending: true },
        filterBar: { compactMode: false },
        sort: "name",
        stripe: true,
        cellEdit: false,
        cellMenu: false,
        rowExpander: {
          renderer: ({ record }: any) =>
            `<div class="dc-expander"><b>Notes</b><p>${esc(record.notes || "—")}</p>${record.offer ? `<b>Current offer</b><p>${esc(record.offer)}</p>` : ""}</div>`,
        },
      },
      columns: [
        {
          text: "Customer",
          field: "name",
          flex: 1.4,
          minWidth: 190,
          renderer: ({ record }: any) => ({
            children: [
              { tag: "div", className: "dc-res-name", text: record.name },
              { tag: "div", className: "dc-res-sub", text: record.email },
            ],
          }),
        },
        {
          text: "Opted in",
          field: "optedIn",
          type: "check",
          width: 95,
          align: "center",
          readOnly: true,
        },
        { text: "Wants", field: "service", flex: 1, minWidth: 150 },
        { text: "Photographer", field: "photographer", width: 130 },
        { text: "Days", field: "days", width: 150 },
        { text: "Times", field: "times", width: 120 },
        { text: "Last session", field: "lastSession", type: "date", format: "MMM YYYY", width: 120 },
        { text: "Next booking", field: "nextBooking", width: 190, renderer: ({ value }: any) => value || "—" },
        {
          text: "DayCloser",
          field: "outreach",
          width: 200,
          htmlEncode: false,
          renderer: ({ value }: any) => `<span class="dc-pill ${OUTREACH_TONE(value)}">${esc(value)}</span>`,
        },
        { text: "Deposits", field: "depositsPaid", type: "number", width: 95, align: "right", renderer: ({ value }: any) => (value ? `$${value}` : "—") },
        {
          text: "",
          field: "token",
          width: 120,
          sortable: false,
          filterable: false,
          htmlEncode: false,
          renderer: ({ record }: any) => (record.token ? `<a class="dc-link" href="/offer/${record.token}" target="_blank" rel="noreferrer">Customer view ↗</a>` : ""),
        },
      ],
    }),
    [],
  );

  return (
    <div className="dc-grid h-full w-full">
      <BryntumGrid {...(config as any)} data={data} />
    </div>
  );
}
