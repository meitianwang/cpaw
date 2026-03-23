import type { ProviderDefinition } from "./types.js";

export const xaiProvider: ProviderDefinition = {
  id: "xai",
  label: "xAI (Grok)",
  protocol: "openai",
  defaultBaseUrl: "https://api.x.ai/v1",
  auth: { method: { type: "api_key", label: "API Key" } },
  models: [
    { id: "grok-3", label: "Grok 3", tokens: 131072 },
    { id: "grok-3-mini", label: "Grok 3 Mini", tokens: 131072 },
  ],
};
