import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/", "/offer"],
  // The customer's invitation page and its API are reached by an unguessable link token.
  publicPaths: ["/offer", "/api/public"],
  rootAuth: true,
  marketing: false,
});
