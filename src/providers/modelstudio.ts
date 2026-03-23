import type { ProviderDefinition } from "./types.js";

export const modelstudioProvider: ProviderDefinition = {
  id: "modelstudio",
  label: "ModelStudio (阿里百炼)",
  protocol: "openai",
  defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  auth: { method: { type: "api_key", label: "API Key" } },
  models: [
    { id: "qwen-max", label: "Qwen Max", tokens: 32768 },
    { id: "qwen-plus", label: "Qwen Plus", tokens: 131072 },
    { id: "qwen-turbo", label: "Qwen Turbo", tokens: 131072 },
  ],
};
