/**
 * Embedding Batch API support — aligned with OpenClaw's batch-openai/gemini/voyage.
 * Supports async batch processing for OpenAI, Gemini, and Voyage.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BatchConfig = {
  enabled: boolean;
  /** Wait for batch completion before returning. */
  wait: boolean;
  /** Max concurrent batch jobs. */
  concurrency: number;
  /** Poll interval in ms. */
  pollIntervalMs: number;
  /** Timeout in ms. */
  timeoutMs: number;
};

type BatchRequest = {
  customId: string;
  text: string;
};

type BatchResult = Map<string, number[]>;

// ---------------------------------------------------------------------------
// Shared utils
// ---------------------------------------------------------------------------

function splitRequests<T>(items: T[], maxPerGroup: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += maxPerGroup) {
    groups.push(items.slice(i, i + maxPerGroup));
  }
  return groups;
}

async function pollUntilDone(params: {
  check: () => Promise<{ done: boolean; error?: string }>;
  pollIntervalMs: number;
  timeoutMs: number;
  label: string;
}): Promise<void> {
  const deadline = Date.now() + params.timeoutMs;
  while (Date.now() < deadline) {
    const status = await params.check();
    if (status.done) {
      if (status.error) throw new Error(`${params.label}: ${status.error}`);
      return;
    }
    await new Promise((r) => setTimeout(r, params.pollIntervalMs));
  }
  throw new Error(`${params.label}: timed out after ${Math.round(params.timeoutMs / 1000)}s`);
}

// ---------------------------------------------------------------------------
// OpenAI Batch API
// ---------------------------------------------------------------------------

export async function runOpenAiBatch(params: {
  requests: BatchRequest[];
  apiKey: string;
  baseUrl: string;
  model: string;
  config: BatchConfig;
}): Promise<BatchResult> {
  const { apiKey, baseUrl, model, config } = params;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const base = baseUrl.replace(/\/$/, "");
  const results: BatchResult = new Map();

  const groups = splitRequests(params.requests, 50_000);
  for (const group of groups) {
    // Build JSONL
    const jsonl = group.map((r) => JSON.stringify({
      custom_id: r.customId,
      method: "POST",
      url: "/v1/embeddings",
      body: { model, input: r.text },
    })).join("\n");

    // Upload file
    const formData = new FormData();
    formData.append("purpose", "batch");
    formData.append("file", new Blob([jsonl], { type: "application/jsonl" }), "batch.jsonl");

    const uploadRes = await fetch(`${base}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
    if (!uploadRes.ok) throw new Error(`OpenAI batch file upload failed: ${uploadRes.status}`);
    const uploadData = await uploadRes.json() as { id: string };

    // Create batch
    const batchRes = await fetch(`${base}/batches`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        input_file_id: uploadData.id,
        endpoint: "/v1/embeddings",
        completion_window: "24h",
      }),
    });
    if (!batchRes.ok) throw new Error(`OpenAI batch create failed: ${batchRes.status}`);
    const batchData = await batchRes.json() as { id: string };

    if (!config.wait) continue;

    // Poll
    await pollUntilDone({
      label: "OpenAI batch",
      pollIntervalMs: config.pollIntervalMs,
      timeoutMs: config.timeoutMs,
      async check() {
        const res = await fetch(`${base}/batches/${batchData.id}`, { headers: { Authorization: `Bearer ${apiKey}` } });
        const data = await res.json() as { status: string; output_file_id?: string; errors?: unknown };
        if (data.status === "completed" && data.output_file_id) {
          // Fetch output
          const outRes = await fetch(`${base}/files/${data.output_file_id}/content`, { headers: { Authorization: `Bearer ${apiKey}` } });
          const outText = await outRes.text();
          for (const line of outText.split("\n")) {
            if (!line.trim()) continue;
            try {
              const row = JSON.parse(line) as {
                custom_id: string;
                response?: { body?: { data?: Array<{ embedding?: number[] }> } };
              };
              const vec = row.response?.body?.data?.[0]?.embedding;
              if (vec && row.custom_id) results.set(row.custom_id, vec);
            } catch {}
          }
          return { done: true };
        }
        if (["failed", "cancelled", "expired"].includes(data.status)) {
          return { done: true, error: `batch ${data.status}` };
        }
        return { done: false };
      },
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Gemini Batch API
// ---------------------------------------------------------------------------

export async function runGeminiBatch(params: {
  requests: BatchRequest[];
  apiKey: string;
  baseUrl: string;
  model: string;
  config: BatchConfig;
  outputDimensionality?: number;
}): Promise<BatchResult> {
  const { apiKey, baseUrl, model, config } = params;
  const base = baseUrl.replace(/\/$/, "");
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;
  const results: BatchResult = new Map();

  const groups = splitRequests(params.requests, 50_000);
  for (const group of groups) {
    // Build JSONL for Gemini batch
    const jsonl = group.map((r) => {
      const req: Record<string, unknown> = {
        key: r.customId,
        content: { parts: [{ text: r.text }] },
        taskType: "RETRIEVAL_DOCUMENT",
      };
      if (params.outputDimensionality) req.outputDimensionality = params.outputDimensionality;
      return JSON.stringify(req);
    }).join("\n");

    // Upload file
    const boundary = `batch-${Date.now()}`;
    const metadata = JSON.stringify({ file: { displayName: `batch-${Date.now()}.jsonl` } });
    const body = [
      `--${boundary}`, "Content-Type: application/json", "", metadata,
      `--${boundary}`, "Content-Type: application/jsonl", "", jsonl,
      `--${boundary}--`,
    ].join("\r\n");

    const uploadRes = await fetch(`${base}/upload/v1beta/files?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!uploadRes.ok) throw new Error(`Gemini batch upload failed: ${uploadRes.status}`);
    const uploadData = await uploadRes.json() as { file?: { uri?: string } };
    const fileUri = uploadData.file?.uri;
    if (!fileUri) throw new Error("Gemini batch upload: no file URI returned");

    // Submit batch
    const batchRes = await fetch(`${base}/${modelPath}:asyncBatchEmbedContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: fileUri }),
    });
    if (!batchRes.ok) throw new Error(`Gemini batch create failed: ${batchRes.status}`);
    const batchData = await batchRes.json() as { name?: string };

    if (!config.wait || !batchData.name) continue;

    // Poll
    await pollUntilDone({
      label: "Gemini batch",
      pollIntervalMs: config.pollIntervalMs,
      timeoutMs: config.timeoutMs,
      async check() {
        const res = await fetch(`${base}/${batchData.name}?key=${apiKey}`);
        const data = await res.json() as { done?: boolean; error?: { message?: string }; response?: { outputFile?: string } };
        if (data.error) return { done: true, error: data.error.message };
        if (data.done && data.response?.outputFile) {
          const outRes = await fetch(`${data.response.outputFile}?key=${apiKey}&alt=media`);
          const outText = await outRes.text();
          for (const line of outText.split("\n")) {
            if (!line.trim()) continue;
            try {
              const row = JSON.parse(line) as { key?: string; custom_id?: string; embedding?: { values?: number[] } };
              const id = row.key ?? row.custom_id;
              const vec = row.embedding?.values;
              if (id && vec) results.set(id, vec);
            } catch {}
          }
          return { done: true };
        }
        return { done: data.done ?? false };
      },
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Voyage Batch API
// ---------------------------------------------------------------------------

export async function runVoyageBatch(params: {
  requests: BatchRequest[];
  apiKey: string;
  baseUrl: string;
  model: string;
  config: BatchConfig;
}): Promise<BatchResult> {
  const { apiKey, baseUrl, model, config } = params;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const base = baseUrl.replace(/\/$/, "");
  const results: BatchResult = new Map();

  const groups = splitRequests(params.requests, 50_000);
  for (const group of groups) {
    const jsonl = group.map((r) => JSON.stringify({
      custom_id: r.customId,
      body: { input: r.text },
    })).join("\n");

    // Upload file
    const formData = new FormData();
    formData.append("purpose", "batch");
    formData.append("file", new Blob([jsonl], { type: "application/jsonl" }), "batch.jsonl");

    const uploadRes = await fetch(`${base}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
    if (!uploadRes.ok) throw new Error(`Voyage batch file upload failed: ${uploadRes.status}`);
    const uploadData = await uploadRes.json() as { id: string };

    // Create batch
    const batchRes = await fetch(`${base}/batches`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        input_file_id: uploadData.id,
        endpoint: "/v1/embeddings",
        completion_window: "12h",
        request_params: { model, input_type: "document" },
      }),
    });
    if (!batchRes.ok) throw new Error(`Voyage batch create failed: ${batchRes.status}`);
    const batchData = await batchRes.json() as { id: string };

    if (!config.wait) continue;

    // Poll
    await pollUntilDone({
      label: "Voyage batch",
      pollIntervalMs: config.pollIntervalMs,
      timeoutMs: config.timeoutMs,
      async check() {
        const res = await fetch(`${base}/batches/${batchData.id}`, { headers: { Authorization: `Bearer ${apiKey}` } });
        const data = await res.json() as { status: string; output_file_id?: string };
        if (data.status === "completed" && data.output_file_id) {
          const outRes = await fetch(`${base}/files/${data.output_file_id}/content`, { headers: { Authorization: `Bearer ${apiKey}` } });
          const outText = await outRes.text();
          for (const line of outText.split("\n")) {
            if (!line.trim()) continue;
            try {
              const row = JSON.parse(line) as {
                custom_id: string;
                response?: { body?: { data?: Array<{ embedding?: number[] }> } };
              };
              const vec = row.response?.body?.data?.[0]?.embedding;
              if (vec && row.custom_id) results.set(row.custom_id, vec);
            } catch {}
          }
          return { done: true };
        }
        if (["failed", "cancelled", "expired"].includes(data.status)) {
          return { done: true, error: `batch ${data.status}` };
        }
        return { done: false };
      },
    });
  }

  return results;
}
