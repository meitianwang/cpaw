/**
 * Multi-provider embedding system — aligned with OpenClaw's embeddings.ts.
 * Supports: OpenAI, Local (node-llama-cpp), Gemini, Voyage, Mistral, Ollama.
 * Includes auto-detection and provider fallback.
 */

import type {
  EmbeddingProviderId,
  EmbeddingProviderRequest,
  EmbeddingProviderFallback,
  MemoryConfig,
} from "./types.js";
import { createLocalEmbeddingProvider, isLocalModelAvailable } from "./local-embedding.js";

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export type EmbeddingProvider = {
  id: EmbeddingProviderId;
  model: string;
  embedQuery(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
};

export type EmbeddingProviderResult = {
  provider: EmbeddingProvider | null;
  requestedProvider: EmbeddingProviderRequest;
  fallbackFrom?: EmbeddingProviderId;
  fallbackReason?: string;
  providerUnavailableReason?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RETRY_MAX = 3;
const RETRY_BASE_MS = 500;

/** Auto-detection order — same as OpenClaw. Ollama excluded (no implicit local assumption). */
const AUTO_PROBE_ORDER: EmbeddingProviderId[] = ["openai", "gemini", "voyage", "mistral"];

const DEFAULT_MODELS: Record<string, string> = {
  openai: "text-embedding-3-small",
  local: "hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf",
  gemini: "gemini-embedding-001",
  voyage: "voyage-4-large",
  mistral: "mistral-embed",
  ollama: "nomic-embed-text",
};

export const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  voyage: "https://api.voyageai.com/v1",
  mistral: "https://api.mistral.ai/v1",
  ollama: "http://localhost:11434",
};

// ---------------------------------------------------------------------------
// Normalize model names (strip provider prefixes)
// ---------------------------------------------------------------------------

function normalizeModel(provider: EmbeddingProviderId, model: string): string {
  if (!model.trim()) return DEFAULT_MODELS[provider];
  const prefixes: Record<string, string[]> = {
    openai: ["openai/"],
    local: [],
    gemini: ["models/", "gemini/", "google/"],
    voyage: ["voyage/"],
    mistral: ["mistral/"],
    ollama: ["ollama/"],
  };
  let normalized = model;
  for (const prefix of prefixes[provider]) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
    }
  }
  return normalized || DEFAULT_MODELS[provider];
}

// ---------------------------------------------------------------------------
// Generic fetch helper with retry
// ---------------------------------------------------------------------------

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  errorPrefix: string,
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_MAX; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err = new Error(`${errorPrefix}: HTTP ${res.status} ${body}`);
        (err as { status?: number }).status = res.status;
        throw err;
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number }).status;
      if (status === 429 || (status && status >= 500)) {
        await new Promise((r) => setTimeout(r, Math.min(RETRY_BASE_MS * 2 ** attempt, 8000)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Provider factories
// ---------------------------------------------------------------------------

function createOpenAiProvider(apiKey: string, baseUrl: string, model: string): EmbeddingProvider {
  const url = `${baseUrl}/embeddings`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  async function embed(input: string | string[]): Promise<number[][]> {
    const data = await fetchWithRetry(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, input }),
    }, "openai embeddings failed") as { data?: Array<{ index: number; embedding: number[] }> };
    const sorted = [...(data.data ?? [])].sort((a, b) => a.index - b.index);
    return sorted.map((d) => d.embedding);
  }

  return {
    id: "openai",
    model,
    async embedQuery(text) { return (await embed(text))[0] ?? []; },
    async embedBatch(texts) { return texts.length ? embed(texts) : []; },
  };
}

function createGeminiProvider(apiKey: string, baseUrl: string, model: string, outputDimensionality?: number): EmbeddingProvider {
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;

  async function embedOne(text: string, taskType: string): Promise<number[]> {
    const url = `${baseUrl}/${modelPath}:embedContent?key=${apiKey}`;
    const body: Record<string, unknown> = { content: { parts: [{ text }] }, taskType };
    if (outputDimensionality) body.outputDimensionality = outputDimensionality;
    const data = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, "gemini embeddings failed") as { embedding?: { values?: number[] } };
    return data.embedding?.values ?? [];
  }

  async function embedBatch(texts: string[], taskType: string): Promise<number[][]> {
    const url = `${baseUrl}/${modelPath}:batchEmbedContents?key=${apiKey}`;
    const requests = texts.map((text) => {
      const req: Record<string, unknown> = { model: modelPath, content: { parts: [{ text }] }, taskType };
      if (outputDimensionality) req.outputDimensionality = outputDimensionality;
      return req;
    });
    const data = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }, "gemini batch embeddings failed") as { embeddings?: Array<{ values?: number[] }> };
    return (data.embeddings ?? []).map((e) => e.values ?? []);
  }

  return {
    id: "gemini",
    model,
    async embedQuery(text) { return embedOne(text, "RETRIEVAL_QUERY"); },
    async embedBatch(texts) {
      return texts.length ? embedBatch(texts, "RETRIEVAL_DOCUMENT") : [];
    },
  };
}

function createVoyageProvider(apiKey: string, baseUrl: string, model: string): EmbeddingProvider {
  const url = `${baseUrl}/embeddings`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  async function embed(input: string[], inputType?: "query" | "document"): Promise<number[][]> {
    const body: Record<string, unknown> = { model, input };
    if (inputType) body.input_type = inputType;
    const data = await fetchWithRetry(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }, "voyage embeddings failed") as { data?: Array<{ embedding?: number[] }> };
    return (data.data ?? []).map((e) => e.embedding ?? []);
  }

  return {
    id: "voyage",
    model,
    async embedQuery(text) { return (await embed([text], "query"))[0] ?? []; },
    async embedBatch(texts) { return texts.length ? embed(texts, "document") : []; },
  };
}

function createMistralProvider(apiKey: string, baseUrl: string, model: string): EmbeddingProvider {
  const url = `${baseUrl}/embeddings`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  async function embed(input: string[]): Promise<number[][]> {
    const data = await fetchWithRetry(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, input }),
    }, "mistral embeddings failed") as { data?: Array<{ embedding?: number[] }> };
    return (data.data ?? []).map((e) => e.embedding ?? []);
  }

  return {
    id: "mistral",
    model,
    async embedQuery(text) { return (await embed([text]))[0] ?? []; },
    async embedBatch(texts) { return texts.length ? embed(texts) : []; },
  };
}

function createOllamaProvider(apiKey: string | undefined, baseUrl: string, model: string): EmbeddingProvider {
  const url = `${baseUrl}/api/embeddings`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  async function embedOne(text: string): Promise<number[]> {
    const data = await fetchWithRetry(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, prompt: text }),
    }, "ollama embeddings failed") as { embedding?: number[] };
    if (!Array.isArray(data.embedding)) {
      throw new Error("Ollama embeddings response missing embedding[]");
    }
    return data.embedding;
  }

  return {
    id: "ollama",
    model,
    embedQuery: embedOne,
    async embedBatch(texts) { return Promise.all(texts.map(embedOne)); },
  };
}

// ---------------------------------------------------------------------------
// Create a single provider by ID
// ---------------------------------------------------------------------------

function isMissingApiKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no api key|apikey.*required|missing.*key|unauthorized|401/i.test(msg);
}

function createProviderById(
  id: EmbeddingProviderId,
  config: MemoryConfig,
): EmbeddingProvider {
  // Local provider — no API key needed, uses node-llama-cpp
  if (id === "local") {
    const modelUri = config.providers.local?.modelUri;
    if (!isLocalModelAvailable(modelUri)) {
      throw new Error("No local embedding model available. Install node-llama-cpp and provide a model URI.");
    }
    return createLocalEmbeddingProvider(modelUri);
  }

  const providerCfg = config.providers[id];
  const apiKey = providerCfg?.apiKey ?? "";
  const baseUrl = (providerCfg?.baseUrl ?? DEFAULT_BASE_URLS[id] ?? "").replace(/\/$/, "");
  const model = normalizeModel(id, config.model);

  if (id === "ollama") {
    // Ollama doesn't require an API key
    return createOllamaProvider(apiKey, baseUrl, model);
  }

  if (!apiKey) {
    throw new Error(`No API key found for provider ${id}`);
  }

  switch (id) {
    case "openai": return createOpenAiProvider(apiKey, baseUrl, model);
    case "gemini": return createGeminiProvider(apiKey, baseUrl, model, config.outputDimensionality);
    case "voyage": return createVoyageProvider(apiKey, baseUrl, model);
    case "mistral": return createMistralProvider(apiKey, baseUrl, model);
    default: throw new Error(`Unknown embedding provider: ${id as string}`);
  }
}

// ---------------------------------------------------------------------------
// createEmbeddingProvider — auto-detect + fallback, aligned with OpenClaw
// ---------------------------------------------------------------------------

export async function createEmbeddingProvider(
  config: MemoryConfig,
): Promise<EmbeddingProviderResult> {
  const requested = config.provider;

  // --- Auto mode: try local first if available, then remote providers ---
  if (requested === "auto") {
    const errors: string[] = [];
    // Try local model first (aligned with OpenClaw)
    if (isLocalModelAvailable(config.providers.local?.modelUri)) {
      try {
        const provider = createProviderById("local", config);
        return { provider, requestedProvider: "auto" };
      } catch (err) {
        errors.push(`local: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    for (const id of AUTO_PROBE_ORDER) {
      try {
        const provider = createProviderById(id, config);
        return { provider, requestedProvider: "auto" };
      } catch (err) {
        if (isMissingApiKeyError(err)) {
          errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
        throw err;
      }
    }
    return {
      provider: null,
      requestedProvider: "auto",
      providerUnavailableReason: `No embedding provider available. Tried: ${errors.join("; ")}`,
    };
  }

  // --- Specific provider ---
  try {
    const provider = createProviderById(requested, config);
    return { provider, requestedProvider: requested };
  } catch (err) {
    // Try fallback
    const fallback = config.fallback;
    if (fallback !== "none" && fallback !== requested) {
      try {
        const provider = createProviderById(fallback, config);
        return {
          provider,
          requestedProvider: requested,
          fallbackFrom: requested,
          fallbackReason: err instanceof Error ? err.message : String(err),
        };
      } catch (fallbackErr) {
        if (isMissingApiKeyError(err) && isMissingApiKeyError(fallbackErr)) {
          return {
            provider: null,
            requestedProvider: requested,
            providerUnavailableReason: `${requested}: ${err instanceof Error ? err.message : String(err)}; fallback ${fallback}: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
          };
        }
        throw new Error(
          `Primary provider ${requested} failed: ${err instanceof Error ? err.message : String(err)}; ` +
          `Fallback ${fallback} also failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
        );
      }
    }

    // No fallback
    if (isMissingApiKeyError(err)) {
      return {
        provider: null,
        requestedProvider: requested,
        providerUnavailableReason: err instanceof Error ? err.message : String(err),
      };
    }
    throw err;
  }
}
