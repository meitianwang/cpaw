import type { ProviderDefinition } from "./types.js";

export const qianfanProvider: ProviderDefinition = {
  id: "qianfan",
  label: "Qianfan (百度千帆)",
  protocol: "openai",
  defaultBaseUrl: "https://qianfan.baidubce.com/v2",
  auth: { method: { type: "api_key", label: "API Key" } },
  models: [
    { id: "ernie-4.5-8k", label: "ERNIE 4.5 8K", tokens: 8192 },
    { id: "ernie-4.5-128k", label: "ERNIE 4.5 128K", tokens: 131072 },
    { id: "ernie-x1-32k", label: "ERNIE X1 32K", tokens: 32768 },
  ],
};
