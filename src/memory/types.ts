/**
 * Memory system types — aligned with OpenClaw's memory module.
 */

import type { BatchConfig } from "./batch.js";
import type { MMRConfig } from "./mmr.js";
import type { TemporalDecayConfig } from "./temporal-decay.js";
import type { MultimodalSettings } from "./multimodal.js";

export type MemorySource = "memory" | "sessions";

export type EmbeddingProviderId = "openai" | "local" | "gemini" | "voyage" | "mistral" | "ollama";
export type EmbeddingProviderRequest = EmbeddingProviderId | "auto";
export type EmbeddingProviderFallback = EmbeddingProviderId | "none";

export type MemoryCitationsMode = "auto" | "on" | "off";

export type MemorySearchResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: MemorySource;
  citation?: string;
};

export type MemoryConfig = {
  enabled: boolean;
  sources: MemorySource[];
  provider: EmbeddingProviderRequest;
  fallback: EmbeddingProviderFallback;
  model: string;
  outputDimensionality?: number;
  citations: MemoryCitationsMode;
  /** Per-provider API keys / base URLs. */
  providers: {
    openai?: { apiKey?: string; baseUrl?: string };
    local?: { modelUri?: string };
    gemini?: { apiKey?: string; baseUrl?: string };
    voyage?: { apiKey?: string; baseUrl?: string };
    mistral?: { apiKey?: string; baseUrl?: string };
    ollama?: { apiKey?: string; baseUrl?: string };
  };
  chunking: { tokens: number; overlap: number };
  batch: BatchConfig;
  query: {
    maxResults: number;
    minScore: number;
    hybrid: {
      enabled: boolean;
      vectorWeight: number;
      textWeight: number;
    };
    mmr: MMRConfig;
    temporalDecay: TemporalDecayConfig;
  };
  sync: {
    intervalMinutes: number;
    watch: boolean;
    watchDebounceMs: number;
  };
  multimodal: MultimodalSettings;
};

export type MemoryStatus = {
  enabled: boolean;
  provider: string;
  model: string;
  searchMode: "hybrid" | "vector" | "fts-only";
  fallback?: { from: string; reason: string };
  files: number;
  chunks: number;
  dirty: boolean;
  sources: MemorySource[];
  sourceCounts: Array<{ source: MemorySource; files: number; chunks: number }>;
  fts: { enabled: boolean; available: boolean; error?: string };
  cache: { enabled: boolean; entries: number };
  citations: MemoryCitationsMode;
};

export type MemorySyncProgress = {
  completed: number;
  total: number;
  label?: string;
};
