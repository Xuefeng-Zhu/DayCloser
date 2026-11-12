import type { GridColumnConfig } from "@bryntum/grid-enterprise";
import { BryntumGrid } from "@bryntum/grid-react-enterprise";
import { useMemo } from "react";

import { registerBryntumLicense } from "./bryntum.client";
import type { CustomerRow } from "./customers-grid";
import { dateTime } from "./format";

import "@bryntum/grid-enterprise/grid.thin.css";
import "./customers-grid.css";

registerBryntumLicense();

export default function CustomersGridClient({
  rows,
  timezone,
  emptyText,
}: {
  rows: CustomerRow[];
  timezone: string;
  emptyText: string;
}) {
  const columns = useMemo<GridColumnConfig[]>(
    () => [
      { text: "Customer", field: "name", flex: 1, minWidth: 155 },
      { text: "Interest", field: "interest", flex: 2, minWidth: 270 },
      { text: "Outreach eligibility", field: "eligibility", flex: 1, minWidth: 165 },
      {
        text: "Last message",
        field: "lastMessageAt",
        flex: 1.4,
        minWidth: 220,
        renderer: ({ value }: { value: unknown }) =>
          typeof value === "string"
            ? { tag: "time", datetime: value, text: dateTime(value, timezone) }
            : { tag: "span", className: "text-muted-foreground", text: "No messages" },
      },
    ],
    [timezone],
  );

  return (
    <BryntumGrid
      ariaLabel="Studio customers"
      data={rows}
      columns={columns}
      emptyText={emptyText}
      height={416}
      rowHeight={44}
      readOnly
      cellEditFeature={false}
      columnPickerFeature={false}
      sortFeature
    />
  );
}
