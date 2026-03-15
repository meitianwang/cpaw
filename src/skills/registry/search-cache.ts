/**
 * Trigram-based search cache with TTL and LRU eviction.
 *
 * Avoids redundant API calls when similar queries are made within a short
 * time window. Uses Dice coefficient on character trigrams for fuzzy matching.
 */

import type { RegistrySearchHit } from "./types.js";

// ---------------------------------------------------------------------------
// Trigram utilities
// ---------------------------------------------------------------------------

function buildTrigrams(s: string): ReadonlySet<string> {
  const normalized = s.toLowerCase().trim();
  const padded = `  ${normalized} `;
  const set = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

/** Dice coefficient: 2|A∩B| / (|A|+|B|). Returns 0–1. */
function diceSimilarity(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  return (2 * intersection) / (a.size + b.size);
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  readonly query: string;
  readonly trigrams: ReadonlySet<string>;
  readonly results: readonly RegistrySearchHit[];
  readonly expiresAt: number;
}

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SIMILARITY_THRESHOLD = 0.7;

export class SearchCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES, ttlMs = DEFAULT_TTL_MS) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  /** Look up a query. Returns cached results or null on miss. */
  get(query: string): readonly RegistrySearchHit[] | null {
    const now = Date.now();
    const normalized = query.toLowerCase().trim();

    // Exact match first
    const exact = this.entries.get(normalized);
    if (exact && now < exact.expiresAt) {
      // LRU bump: delete + re-insert
      this.entries.delete(normalized);
      this.entries.set(normalized, exact);
      return exact.results;
    }

    // Fuzzy match via trigram similarity
    const queryTrigrams = buildTrigrams(normalized);
    for (const [key, entry] of this.entries) {
      if (now >= entry.expiresAt) {
        this.entries.delete(key);
        continue;
      }
      if (diceSimilarity(queryTrigrams, entry.trigrams) >= SIMILARITY_THRESHOLD) {
        // LRU bump
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry.results;
      }
    }

    return null;
  }

  /** Store results for a query. */
  set(query: string, results: readonly RegistrySearchHit[]): void {
    const normalized = query.toLowerCase().trim();

    // Evict expired entries
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now >= entry.expiresAt) this.entries.delete(key);
    }

    // LRU eviction if at capacity
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }

    this.entries.set(normalized, {
      query: normalized,
      trigrams: buildTrigrams(normalized),
      results,
      expiresAt: now + this.ttlMs,
    });
  }

  /** Clear all cached entries. */
  clear(): void {
    this.entries.clear();
  }
}
