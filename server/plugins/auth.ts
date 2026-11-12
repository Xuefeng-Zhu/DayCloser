import { registerAuthPublicPaths } from "@agent-native/core/server";
import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

registerAuthPublicPaths([
  "/inbox",
  "/api/daycloser/customer",
  "/api/daycloser/customer/reply",
  "/api/daycloser/customer/accept",
  "/api/daycloser/customer/checkout",
  "/api/daycloser/customer/capture",
  "/api/paypal/webhook",
]);

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/", "/inbox"],
  rootAuth: true,
  marketing: false,
});
