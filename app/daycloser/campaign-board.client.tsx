import { BryntumTaskBoard } from "@bryntum/taskboard-react-enterprise";
import type { BryntumTaskBoardProps } from "@bryntum/taskboard-react-enterprise";
import type { MerchantDashboard } from "@shared/daycloser";
import { useMemo } from "react";

import { campaignStatusLabels, time } from "./format";

import { registerBryntumLicense } from "./bryntum.client";
import "@bryntum/taskboard-enterprise/taskboard.thin.css";
import "./campaign-board.css";

registerBryntumLicense();

export type CampaignBoardProps = {
  dashboard: MerchantDashboard;
  selectedCampaignId: string | undefined;
  onSelect: (campaignId: string) => void;
};

const boardOptions: BryntumTaskBoardProps = {
  ariaLabel: "Campaign status board",
  cardRole: "button",
  columnField: "status",
  columns: Object.entries(campaignStatusLabels).map(([id, text]) => ({ id, text, minWidth: 140 })),
  height: 192,
  readOnly: true,
  activateTaskEvent: "taskClick",
  keyMap: { " ": "activate" },
  selectOnNavigation: false,
  showCountInHeader: true,
  showCollapseInHeader: false,
  useDomTransition: false,
  columnDragFeature: false,
  columnHeaderMenuFeature: false,
  columnToolbarsFeature: false,
  simpleTaskEditFeature: false,
  taskDragFeature: false,
  taskDragSelectFeature: false,
  taskEditFeature: false,
  taskMenuFeature: false,
  bodyItems: { description: { type: "text" } },
  taskRenderer: ({ taskRecord, cardConfig }) => {
    cardConfig["aria-label"] = `${taskRecord.name}, ${taskRecord.description}`;
  },
};

export default function CampaignBoardClient({
  dashboard,
  selectedCampaignId,
  onSelect,
}: CampaignBoardProps) {
  const { campaigns, resources } = dashboard;
  const { timezone } = dashboard.studio;
  const tasks = useMemo(() => {
    const names = new Map(resources.map(({ id, name }) => [id, name]));
    return campaigns.map(({ id, policy, status }) => {
      const { opening } = policy;
      return {
        id,
        name: names.get(opening.resourceId) ?? "Photographer",
        description: `${time(opening.startAt, timezone)}–${time(opening.endAt, timezone)}`,
        status,
        cls: id === selectedCampaignId ? "dc-campaign-selected" : "",
      };
    });
  }, [campaigns, resources, selectedCampaignId, timezone]);

  return (
    <div className="min-w-0 border-t border-border">
      <BryntumTaskBoard
        {...boardOptions}
        tasks={tasks}
        onActivateTask={({ taskRecord }) => onSelect(String(taskRecord.id))}
      />
    </div>
  );
}
