/**
 * Maximal Marginal Relevance (MMR) re-ranking — ported from OpenClaw.
 * Balances relevance with diversity: MMR = λ * relevance - (1-λ) * max_similarity_to_selected
 */

export type MMRConfig = {
  enabled: boolean;
  /** 0 = max diversity, 1 = max relevance. Default 0.7 */
  lambda: number;
};

type MMRItem = { id: string; score: number; content: string };

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9_]+/g) ?? []);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  let intersection = 0;
  for (const t of smaller) {
    if (larger.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function mmrRerank<T extends MMRItem>(items: T[], config: Partial<MMRConfig> = {}): T[] {
  const { enabled = false, lambda = 0.7 } = config;
  if (!enabled || items.length <= 1) return [...items];

  const clampedLambda = Math.max(0, Math.min(1, lambda));
  if (clampedLambda === 1) {
    return [...items].sort((a, b) => b.score - a.score);
  }

  const tokenCache = new Map<string, Set<string>>();
  for (const item of items) tokenCache.set(item.id, tokenize(item.content));

  const maxScore = Math.max(...items.map((i) => i.score));
  const minScore = Math.min(...items.map((i) => i.score));
  const range = maxScore - minScore;
  const norm = (s: number) => (range === 0 ? 1 : (s - minScore) / range);

  const selected: T[] = [];
  const remaining = new Set(items);

  while (remaining.size > 0) {
    let best: T | null = null;
    let bestMMR = -Infinity;

    for (const candidate of remaining) {
      const relevance = norm(candidate.score);
      let maxSim = 0;
      const candidateTokens = tokenCache.get(candidate.id)!;
      for (const sel of selected) {
        const sim = jaccardSimilarity(candidateTokens, tokenCache.get(sel.id)!);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = clampedLambda * relevance - (1 - clampedLambda) * maxSim;
      if (mmr > bestMMR || (mmr === bestMMR && candidate.score > (best?.score ?? -Infinity))) {
        bestMMR = mmr;
        best = candidate;
      }
    }

    if (!best) break;
    selected.push(best);
    remaining.delete(best);
  }

  return selected;
}

/**
 * Apply MMR to hybrid search results.
 */
export function applyMMRToResults<
  T extends { score: number; snippet: string; path: string; startLine: number },
>(results: T[], config: Partial<MMRConfig> = {}): T[] {
  if (results.length === 0) return results;

  const itemById = new Map<string, T>();
  const mmrItems: MMRItem[] = results.map((r, i) => {
    const id = `${r.path}:${r.startLine}:${i}`;
    itemById.set(id, r);
    return { id, score: r.score, content: r.snippet };
  });

  return mmrRerank(mmrItems, config).map((item) => itemById.get(item.id)!);
}
