import { fail, type ActionRunContext } from "@agent-native/core/action";
import { recordChange } from "@agent-native/core/server/poll";

const localEmails = new Set(["dev@local.test", "dev@local"]);

export function configuredStudioId() {
  return (
    process.env.DAYCLOSER_STUDIO_ORG_ID?.trim() || // guard:allow-env-credential — Deployment-level identity and demo configuration for the single studio.
    process.env.DAYCLOSER_MERCHANT_EMAIL?.trim().toLowerCase() || // guard:allow-env-credential — Deployment-level identity and demo configuration for the single studio.
    "daycloser-local"
  );
}

export function merchantStudio(
  ctx: ActionRunContext | undefined,
  allowAgent = false,
) {
  const caller = ctx?.caller;
  const userEmail = ctx?.userEmail?.trim().toLowerCase();
  if (
    !userEmail ||
    (caller !== "http" &&
      caller !== "frontend" &&
      !(allowAgent && caller === "tool"))
  ) {
    fail("A signed-in merchant is required.", {
      statusCode: 401,
      errorCode: "MERCHANT_REQUIRED",
    });
  }

  const merchantEmail =
    process.env.DAYCLOSER_MERCHANT_EMAIL?.trim().toLowerCase(); // guard:allow-env-credential — Deployment-level identity and demo configuration for the single studio.
  const orgId = process.env.DAYCLOSER_STUDIO_ORG_ID?.trim(); // guard:allow-env-credential — Deployment-level identity and demo configuration for the single studio.
  // guard:allow-env-credential — Deployment-level synthetic seed settings.
  const demoEnabled = process.env.DAYCLOSER_DEMO_MODE === "1";
  const localDemo = process.env.NODE_ENV !== "production" && demoEnabled && localEmails.has(userEmail);
  if (merchantEmail ? userEmail !== merchantEmail : !localDemo) {
    fail("This account does not operate the DayCloser studio.", {
      statusCode: 403,
      errorCode: "MERCHANT_FORBIDDEN",
    });
  }
  if (orgId && ctx?.orgId !== orgId) {
    fail("Select the organization configured for this studio.", {
      statusCode: 403,
      errorCode: "STUDIO_ORG_REQUIRED",
    });
  }

  return configuredStudioId();
}

export function refreshMerchantDashboard() {
  const owner = process.env.DAYCLOSER_MERCHANT_EMAIL?.trim().toLowerCase(); // guard:allow-env-credential — Deployment-level operator identity.
  recordChange({
    source: "action",
    type: "update",
    key: "get-daycloser-dashboard",
    owner: owner || "dev@local.test",
  });
}

export const merchantOnly = {
  agentTool: false,
  mcpTool: false,
  toolCallable: false,
  requiresAuth: true,
} as const;
