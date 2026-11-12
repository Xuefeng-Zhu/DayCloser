import {
  createAISDKEngine,
  type AISDKProvider,
} from "@agent-native/core/agent/engine";

// Only an operator-configured literal loopback endpoint can use this transport.
function localModelTransport(
  baseUrl: string,
  requireTool: boolean,
): typeof fetch | undefined {
  const endpoint = new URL(baseUrl);
  if (
    endpoint.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    return undefined;
  const expected = new URL(
    endpoint.href.replace(/\/$/, "") + "/chat/completions",
  ).href;
  return (input, init) => {
    const target = input instanceof Request ? input.url : String(input);
    if (new URL(target).href !== expected) {
      throw new Error(
        "The local model request escaped the configured endpoint.",
      );
    }
    if (!requireTool || typeof init?.body !== "string")
      return fetch(input, { ...init, redirect: "error" });
    const body = JSON.parse(init.body);
    if (Array.isArray(body.tools) && body.tools.length) {
      body.tool_choice = "required";
      body.parallel_tool_calls = false;
    }
    return fetch(input, {
      ...init,
      body: JSON.stringify(body),
      redirect: "error",
    });
  };
}

export function createDayCloserModel(requireTool = false) {
  const model = process.env.DAYCLOSER_MODEL?.trim(); // guard:allow-env-credential — Deployment-level model settings for the single studio worker.
  const provider = process.env.DAYCLOSER_MODEL_PROVIDER?.trim() || "openai"; // guard:allow-env-credential — Deployment-level model settings for the single studio worker.
  const openAiBaseUrl = process.env.OPENAI_BASE_URL?.trim(); // guard:allow-env-credential — Deployment-level OpenAI-compatible endpoint shared with Agent-Native chat.
  const baseUrl = provider === "openai" ? openAiBaseUrl : undefined;
  const keys: Record<string, string | undefined> = {
    openai: process.env.OPENAI_API_KEY, // guard:allow-env-credential — Deployment-level model settings for the single studio worker.
    anthropic: process.env.ANTHROPIC_API_KEY, // guard:allow-env-credential — Deployment-level model settings for the single studio worker.
    openrouter: process.env.OPENROUTER_API_KEY, // guard:allow-env-credential — Deployment-level model settings for the single studio worker.
  };
  if (!model || !Object.prototype.hasOwnProperty.call(keys, provider))
    return null;

  const localFetch =
    baseUrl && provider === "openai"
      ? localModelTransport(baseUrl, requireTool)
      : undefined;
  const key = keys[provider] || (localFetch ? "local" : undefined);
  if (!key) return null;

  const engine = createAISDKEngine(provider as AISDKProvider, {
    model,
    supportedModels: [model],
    acceptsCustomModels: true,
    apiKey: key,
    ...(baseUrl ? { baseUrl } : {}),
    ...(localFetch ? { requestFetch: localFetch } : {}),
    allowEnvFallback: false,
    appName: "DayCloser",
  });
  return { model, engine };
}
