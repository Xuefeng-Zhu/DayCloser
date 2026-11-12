import type { Model } from "@bryntum/core-enterprise";
import type { GridColumnConfig } from "@bryntum/grid-enterprise";
import { BryntumGrid } from "@bryntum/grid-react-enterprise";

import { registerBryntumLicense } from "./bryntum.client";
import type {
  CampaignCustomerReview,
  CampaignCustomerRow,
} from "./campaign-customer-rows";

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
    renderer: ({ record, value }: { record: Model; value: unknown }) => {
      const review = record.get("review") as CampaignCustomerReview | null;
      const nextStep = String(value ?? "");
      if (!review) return { tag: "span", text: nextStep };

      const label = review.kind === "offer" ? "Review offer" : "View reason";
      return {
        tag: "div",
        className: "dc-campaign-next-step",
        children: [
          { tag: "span", text: nextStep },
          {
            tag: "button",
            type: "button",
            className: "dc-campaign-review-button",
            dataset: { campaignCustomerReview: String(record.id) },
            "aria-label": `${label} for ${record.get("customer")}`,
            "aria-haspopup": "dialog",
            text: label,
          },
        ],
      };
    },
  },
];

export default function CampaignCustomerGridClient({
  rows,
  onReview,
}: {
  rows: CampaignCustomerRow[];
  onReview: (customerId: string, trigger: HTMLButtonElement) => void;
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
      onCellClick={({ column, record, target }) => {
        if (column.field !== "nextStep") return;
        const button = target.closest<HTMLButtonElement>(
          "button[data-campaign-customer-review]",
        );
        const customerId = String(record.id);
        if (button?.dataset.campaignCustomerReview === customerId) {
          onReview(customerId, button);
        }
      }}
    />
  );
}
