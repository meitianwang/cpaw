/**
 * Shared fetch helper for Moonshot API tools.
 */

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export async function fetchMoonshotApi<T>(options: {
  baseUrl: string;
  path: string;
  apiKey: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<T> {
  const url = `${normalizeBaseUrl(options.baseUrl)}${options.path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify(options.body),
    signal: options.signal,
  }).catch((err) => {
    throw new Error(`Moonshot API network error: ${err instanceof Error ? err.message : String(err)}`);
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Moonshot API error (${res.status}): ${detail || res.statusText}`);
  }

  return (await res.json()) as T;
}
