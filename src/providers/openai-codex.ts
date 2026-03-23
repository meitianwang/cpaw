import type { ProviderDefinition } from "./types.js";

export const openaiCodexProvider: ProviderDefinition = {
  id: "openai-codex",
  label: "OpenAI Codex",
  protocol: "openai-codex",
  defaultBaseUrl: "",
  auth: {
    method: {
      type: "oauth",
      label: "OpenAI Account",
      clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
      authorizeUrl: "https://auth.openai.com/oauth/authorize",
      tokenUrl: "https://auth.openai.com/oauth/token",
      scopes: "openid profile email offline_access",
      extraParams: { id_token_add_organizations: "true", codex_cli_simplified_flow: "true" },
    },
  },
  models: [
    { id: "codex-mini-latest", label: "Codex Mini (latest)", tokens: 192000 },
    { id: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini", tokens: 192000 },
    { id: "gpt-5.1", label: "GPT-5.1", tokens: 192000 },
    { id: "gpt-5.2", label: "GPT-5.2", tokens: 192000 },
    { id: "gpt-5.3", label: "GPT-5.3", tokens: 192000 },
    { id: "gpt-5.4", label: "GPT-5.4", tokens: 192000 },
  ],
};
