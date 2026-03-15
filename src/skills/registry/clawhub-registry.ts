/**
 * ClawHub registry implementation.
 *
 * Works with both PicoClaw (clawhub.ai) and OpenClaw (clawhub.com)
 * since they share the same API format.
 */

import type {
  SkillRegistry,
  RegistrySearchHit,
  RegistrySkillDetail,
} from "./types.js";
import { validateSlug } from "./types.js";
import { retryAsync } from "../../retry.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HTTP_TIMEOUT_MS = 10_000;
const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function shouldRetryHttp(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message;
    // Retry on network errors and 5xx/429
    if (msg.includes("fetch failed") || msg.includes("ECONNRESET")) return true;
    if (msg.includes("429") || msg.includes("500") || msg.includes("502") || msg.includes("503")) return true;
  }
  return false;
}

function buildHeaders(authToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "klaus-ai",
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

async function assertOk(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${context}: HTTP ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }
}

// ---------------------------------------------------------------------------
// ClawHub registry
// ---------------------------------------------------------------------------

export class ClawHubRegistry implements SkillRegistry {
  readonly id: string;
  private readonly baseUrl: string;
  private readonly authToken?: string;

  constructor(id: string, baseUrl: string, authToken?: string) {
    this.id = id;
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.authToken = authToken;
  }

  async search(
    query: string,
    limit: number,
  ): Promise<readonly RegistrySearchHit[]> {
    const url = `${this.baseUrl}/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`;

    const res = await retryAsync(
      () =>
        fetch(url, {
          headers: buildHeaders(this.authToken),
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        }),
      { attempts: 2, shouldRetry: shouldRetryHttp },
      `${this.id}:search`,
    );

    await assertOk(res, `${this.id} search`);

    const data = (await res.json()) as {
      results?: readonly {
        score?: number;
        slug?: string;
        displayName?: string;
        summary?: string;
        version?: string;
      }[];
    };

    const results = data.results ?? [];
    return results
      .filter((r) => r.slug && r.summary)
      .map((r) => ({
        registryId: this.id,
        score: r.score ?? 0,
        slug: r.slug!,
        displayName: r.displayName ?? r.slug!,
        summary: r.summary!,
        version: r.version ?? "latest",
      }));
  }

  async getDetail(slug: string): Promise<RegistrySkillDetail> {
    validateSlug(slug);
    const url = `${this.baseUrl}/api/v1/skills/${slug}`;

    const res = await retryAsync(
      () =>
        fetch(url, {
          headers: buildHeaders(this.authToken),
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        }),
      { attempts: 2, shouldRetry: shouldRetryHttp },
      `${this.id}:detail`,
    );

    await assertOk(res, `${this.id} detail(${slug})`);

    const data = (await res.json()) as {
      slug?: string;
      displayName?: string;
      summary?: string;
      latestVersion?: string;
      moderation?: {
        isMalwareBlocked?: boolean;
        isSuspicious?: boolean;
      };
    };

    return {
      registryId: this.id,
      slug: data.slug ?? slug,
      displayName: data.displayName ?? slug,
      summary: data.summary ?? "",
      latestVersion: data.latestVersion ?? "latest",
      moderation: {
        isMalwareBlocked: data.moderation?.isMalwareBlocked === true,
        isSuspicious: data.moderation?.isSuspicious === true,
      },
    };
  }

  async download(slug: string, version: string): Promise<Buffer> {
    validateSlug(slug);
    const url = `${this.baseUrl}/api/v1/download?slug=${encodeURIComponent(slug)}&version=${encodeURIComponent(version)}`;

    const res = await retryAsync(
      () =>
        fetch(url, {
          headers: {
            ...buildHeaders(this.authToken),
            Accept: "application/zip, application/octet-stream",
          },
          signal: AbortSignal.timeout(30_000), // longer timeout for downloads
        }),
      { attempts: 2, shouldRetry: shouldRetryHttp },
      `${this.id}:download`,
    );

    await assertOk(res, `${this.id} download(${slug}@${version})`);

    // Check Content-Length if available
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_DOWNLOAD_SIZE) {
      throw new Error(
        `Download too large: ${contentLength} bytes (max ${MAX_DOWNLOAD_SIZE})`,
      );
    }

    // Stream into buffer with size guard
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.byteLength;
      if (totalSize > MAX_DOWNLOAD_SIZE) {
        reader.cancel();
        throw new Error(
          `Download exceeded ${MAX_DOWNLOAD_SIZE} bytes, aborted`,
        );
      }
      chunks.push(value);
    }

    return Buffer.concat(chunks);
  }
}
