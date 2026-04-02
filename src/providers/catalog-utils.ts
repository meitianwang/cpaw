import type { ModelPreset } from "./types.js";

interface AnthropicModel {
  readonly id: string;
  readonly display_name?: string;
}

export async function fetchAnthropicModels(
  apiKey: string,
  baseUrl: string,
): Promise<ModelPreset[]> {
  if (!apiKey) return [];
  const normalized = baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  const url = `${normalized}/v1/models`;
  const res = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: AnthropicModel[] };
  const data = json.data ?? [];

  return data
    .filter((m) => m.id.startsWith("claude-"))
    .map((m) => ({
      id: m.id,
      label: m.display_name || m.id,
      tokens: 200000,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
