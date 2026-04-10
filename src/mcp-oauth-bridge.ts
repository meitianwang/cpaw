/**
 * MCP OAuth Bridge — shared pending-auth state between McpAuthTool and web.ts callback route.
 *
 * Flow (方案2 — 主流程):
 *   1. McpAuthTool calls performMCPOAuthFlow with externalRedirectUri + onExternalCode
 *   2. onExternalCode registers resolve/reject functions here, keyed by serverName
 *   3. OAuth provider redirects browser to /api/oauth/mcp/callback?server=xxx&code=yyy&state=zzz
 *   4. web.ts route calls resolvePendingAuth(serverName, code, state)
 *   5. performMCPOAuthFlow's resolveOnce fires, completing token exchange
 *
 * Flow (方案1 — fallback):
 *   If the redirect fails, user pastes the callback URL in the Web UI.
 *   onWaitingForCallback inside performMCPOAuthFlow handles it directly.
 */

/** TTL for pending auth entries (6 minutes — slightly longer than the 5-min OAuth timeout). */
const PENDING_AUTH_TTL_MS = 6 * 60 * 1000;

interface PendingAuth {
  resolve: (code: string) => void;
  reject: (err: Error) => void;
  /** OAuth state value for CSRF validation. */
  expectedState: string;
  /** Auto-cleanup timer. */
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingAuth>();

/**
 * Register resolve/reject for a pending OAuth auth.
 * Called from performMCPOAuthFlow's onExternalCode callback.
 * Entries auto-expire after PENDING_AUTH_TTL_MS to prevent leaks.
 */
export function registerPendingAuth(
  serverName: string,
  resolve: (code: string) => void,
  reject: (err: Error) => void,
  expectedState: string,
): void {
  // Supersede any existing entry for the same server
  const existing = pending.get(serverName);
  if (existing) {
    clearTimeout(existing.timer);
    existing.reject(new Error("Superseded by new auth request"));
  }

  const timer = setTimeout(() => {
    const entry = pending.get(serverName);
    if (entry && entry.expectedState === expectedState) {
      pending.delete(serverName);
      entry.reject(new Error("Pending OAuth auth expired"));
    }
  }, PENDING_AUTH_TTL_MS);
  timer.unref();

  pending.set(serverName, { resolve, reject, expectedState, timer });
}

/**
 * Resolve a pending auth with the authorization code from the callback route.
 * Validates the OAuth state parameter to prevent CSRF attacks.
 *
 * Two side-effects on state mismatch (both intentional):
 *   - Returns false → caller (web.ts) sends HTTP 403 to the browser.
 *   - Calls entry.reject() → performMCPOAuthFlow's Promise rejects,
 *     surfacing the error in McpAuthTool's background continuation.
 */
export function resolvePendingAuth(serverName: string, code: string, state: string): boolean {
  const entry = pending.get(serverName);
  if (!entry) return false;
  if (entry.expectedState !== state) {
    clearTimeout(entry.timer);
    pending.delete(serverName);
    entry.reject(new Error("OAuth state mismatch - possible CSRF attack"));
    return false;
  }
  clearTimeout(entry.timer);
  pending.delete(serverName);
  entry.resolve(code);
  return true;
}

/**
 * Reject a pending auth (e.g. OAuth error in callback).
 */
export function rejectPendingAuth(serverName: string, error: string): boolean {
  const entry = pending.get(serverName);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pending.delete(serverName);
  entry.reject(new Error(error));
  return true;
}

/**
 * Check if there is a pending auth for a given server.
 */
export function hasPendingAuth(serverName: string): boolean {
  return pending.has(serverName);
}

/**
 * Clean up a pending auth entry after the flow has already resolved/rejected.
 * Does NOT call resolve/reject — caller must ensure the flow is already settled.
 */
export function removePendingAuth(serverName: string): void {
  const entry = pending.get(serverName);
  if (entry) {
    clearTimeout(entry.timer);
    pending.delete(serverName);
  }
}
