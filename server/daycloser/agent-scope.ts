import { AsyncLocalStorage } from "node:async_hooks";

import { fail, type ActionRunContext } from "@agent-native/core/action";

import type { ClaimedJob } from "./repository.js";

type SalesScope = {
  job: ClaimedJob;
};

export const salesScope = new AsyncLocalStorage<SalesScope>();

export function getSalesScope(ctx?: ActionRunContext) {
  const scope = salesScope.getStore();
  if (ctx?.caller !== "automation" || !scope) {
    fail("This operation requires a claimed DayCloser sales job.", {
      statusCode: 403,
      errorCode: "SALES_JOB_REQUIRED",
    });
  }
  return scope;
}

export const jobTool = {
  http: false,
  mcpTool: false,
  toolCallable: false,
  persistInBrowser: false,
  persistInChatHistory: false,
  authorize: (_input: unknown, ctx?: ActionRunContext) =>
    Boolean(getSalesScope(ctx)),
} as const;
