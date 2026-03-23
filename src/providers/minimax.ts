import type { ProviderDefinition } from "./types.js";

export const minimaxProvider: ProviderDefinition = {
  id: "minimax",
  label: "MiniMax",
  protocol: "anthropic",
  defaultBaseUrl: "https://api.minimaxi.com/anthropic",
  auth: { method: { type: "api_key", label: "API Key" } },
  models: [
    { id: "MiniMax-M1", label: "MiniMax M1", tokens: 1000000 },
    { id: "MiniMax-T1", label: "MiniMax T1", tokens: 1000000 },
  ],
};
