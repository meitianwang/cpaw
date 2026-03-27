/**
 * Local GGUF embedding provider via node-llama-cpp — aligned with OpenClaw.
 * Lazily loads node-llama-cpp to avoid startup cost if unused.
 * Supports Hugging Face model URIs, local paths, and HTTPS links.
 */

import { existsSync } from "node:fs";
import type { EmbeddingProvider } from "./embeddings.js";

const DEFAULT_LOCAL_MODEL = "hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf";

// Singleton context to avoid reloading model on every call
let llamaInstance: unknown = null;
let modelInstance: unknown = null;
let contextInstance: unknown = null;
let initPromise: Promise<void> | null = null;

type NodeLlamaCppModule = {
  getLlama: () => Promise<unknown>;
};

async function importNodeLlamaCpp(): Promise<NodeLlamaCppModule> {
  try {
    // Dynamic import — node-llama-cpp is an optional dependency
    return await (Function('return import("node-llama-cpp")')() as Promise<NodeLlamaCppModule>);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
      throw new Error(
        "node-llama-cpp is not installed. Install it with: npm install node-llama-cpp\n" +
        "Requires Node.js 20+ and a C++ compiler for native builds.",
      );
    }
    throw err;
  }
}

async function ensureContext(modelUri: string): Promise<void> {
  if (contextInstance) return;
  if (initPromise) { await initPromise; return; }

  initPromise = (async () => {
    const nlc = await importNodeLlamaCpp();
    llamaInstance = await (nlc.getLlama as () => Promise<{ loadModel: (opts: { modelPath: string }) => Promise<unknown> }>)();
    const llama = llamaInstance as { loadModel: (opts: { modelPath: string }) => Promise<unknown> };
    modelInstance = await llama.loadModel({ modelPath: modelUri });
    const model = modelInstance as { createEmbeddingContext: () => Promise<unknown> };
    contextInstance = await model.createEmbeddingContext();
  })();

  await initPromise;
}

/**
 * Create a local embedding provider using node-llama-cpp.
 * Returns null if node-llama-cpp is not installed.
 */
export function createLocalEmbeddingProvider(modelUri?: string): EmbeddingProvider {
  const uri = modelUri || DEFAULT_LOCAL_MODEL;

  async function embedTexts(texts: string[]): Promise<number[][]> {
    await ensureContext(uri);
    const ctx = contextInstance as {
      getEmbeddingFor: (text: string) => Promise<{ vector: number[] }>;
    };
    const results: number[][] = [];
    for (const text of texts) {
      const result = await ctx.getEmbeddingFor(text);
      results.push(result.vector);
    }
    return results;
  }

  return {
    id: "local",
    model: uri,
    async embedQuery(text) {
      const [vec] = await embedTexts([text]);
      return vec ?? [];
    },
    async embedBatch(texts) {
      return texts.length ? embedTexts(texts) : [];
    },
  };
}

/**
 * Check if a local model URI likely points to an available local file.
 * Hugging Face URIs (hf:) and HTTPS links are considered available (downloaded on demand).
 */
export function isLocalModelAvailable(modelUri?: string): boolean {
  const uri = modelUri || DEFAULT_LOCAL_MODEL;
  if (uri.startsWith("hf:") || uri.startsWith("http://") || uri.startsWith("https://")) {
    return true;
  }
  // Check if local file exists
  try {
    return existsSync(uri);
  } catch {
    return false;
  }
}
