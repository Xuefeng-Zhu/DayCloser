import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import { createDayCloserModel } from "../daycloser/model.js";

const merchantTools = [
  "view-screen",
  "list-openings",
  "list-eligible-customers",
  "propose-campaign",
];

export default createAgentChatPlugin({
  ...(createDayCloserModel() ?? {}),
  appId: "daycloser",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { enabled: false },
  codeExecution: { production: "off" },
  frameworkTools: { preset: "minimal", database: "off", extensions: false },
  resolveActionSurface: () => ({ allowedActionNames: merchantTools }),
  initialToolNames: merchantTools,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the DayCloser merchant assistant. Use view-screen to identify the studio schedule's selected opening when the merchant refers to "this opening." Check the schedule and eligible customers, then use propose-campaign. The merchant reviews the policy and approves the campaign using the schedule controls. Report saved results and scheduling constraints. Never claim that outreach, payment, or booking has occurred unless the application confirms it.`,
});
