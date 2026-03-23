import type { ProviderDefinition } from "./types.js";

export const xiaomiProvider: ProviderDefinition = {
  id: "xiaomi",
  label: "Xiaomi (小米)",
  protocol: "openai",
  defaultBaseUrl: "https://api.xiaomi.com/v1",
  auth: { method: { type: "api_key", label: "API Key" } },
  models: [
    { id: "MiMo-7B-RL", label: "MiMo 7B RL", tokens: 32768 },
  ],
};
