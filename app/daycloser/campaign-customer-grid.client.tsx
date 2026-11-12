import type { GridColumnConfig } from "@bryntum/grid-enterprise";
import { BryntumGrid } from "@bryntum/grid-react-enterprise";

import { registerBryntumLicense } from "./bryntum.client";
import type { CampaignCustomerRow } from "./campaign-customer-rows";

import "@bryntum/grid-enterprise/grid.thin.css";
import "./campaign-customer-grid.css";

registerBryntumLicense();

const columns: GridColumnConfig[] = [
  {
    text: "Customer",
    field: "customer",
    flex: 1,
    minWidth: 120,
    autoHeight: true,
    cellCls: "dc-campaign-customer-name",
  },
  {
    text: "Known needs or constraints",
    field: "needs",
    flex: 2,
    minWidth: 205,
    autoHeight: true,
  },
  {
    text: "Feasible offer",
    field: "offer",
    flex: 1.4,
    minWidth: 150,
    autoHeight: true,
  },
  {
    text: "Current status",
    field: "status",
    flex: 1,
    minWidth: 140,
    autoHeight: true,
  },
  {
    text: "Next step",
    field: "nextStep",
    flex: 1.4,
    minWidth: 155,
    autoHeight: true,
  },
];

export default function CampaignCustomerGridClient({
  rows,
}: {
  rows: CampaignCustomerRow[];
}) {
  const compact = rows.length <= 8;

  return (
    <BryntumGrid
      ariaLabel="Campaign customers"
      columns={columns}
      data={rows}
      autoHeight={compact}
      height={compact ? "auto" : 384}
      minHeight={0}
      rowHeight={44}
      readOnly
      enableTextSelection
      cellEditFeature={false}
      columnPickerFeature={false}
      columnReorderFeature={false}
      headerMenuFeature={false}
      sortFeature={false}
      virtualizeColumns={false}
    />
  );
}
