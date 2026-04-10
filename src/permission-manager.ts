/**
 * Permission request lifecycle manager.
 *
 * Bridges the gap between the engine's synchronous `canUseTool` await and the
 * asynchronous WebSocket round-trip to the browser for user approval.
 *
 * Supports rich responses: updatedInput (user modifies tool args before
 * approving), acceptedSuggestions (user clicks "Always Allow" to persist rules).
 */

import { randomUUID } from "crypto";
import type { WsEvent } from "./gateway/protocol.js";

export interface PermissionResponse {
  decision: "allow" | "deny";
  /** User-modified tool input (if they edited args before approving). */
  updatedInput?: Record<string, unknown>;
  /** Indices of suggestions the user accepted (e.g. "Always Allow"). */
  acceptedSuggestionIndices?: number[];
}

export interface PermissionRequest {
  requestId: string;
  userId: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  message: string;
  resolve: (response: PermissionResponse) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Default timeout: 2 minutes */
const DEFAULT_TIMEOUT_MS = 120_000;

class PermissionManager {
  private pending = new Map<string, PermissionRequest>();

  /**
   * Send a permission request to the user and wait for their decision.
   */
  requestPermission(params: {
    userId: string;
    sessionId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    message: string;
    suggestions?: ReadonlyArray<Record<string, unknown>>;
    sendEvent: (userId: string, event: WsEvent) => void;
    timeoutMs?: number;
  }): Promise<PermissionResponse> {
    const requestId = randomUUID();
    const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return new Promise<PermissionResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ decision: "deny" });
      }, timeoutMs);

      this.pending.set(requestId, {
        requestId,
        userId: params.userId,
        sessionId: params.sessionId,
        toolName: params.toolName,
        toolInput: params.toolInput,
        message: params.message,
        resolve,
        timer,
      });

      // Push permission request to the user's browser
      params.sendEvent(params.userId, {
        type: "permission_request",
        requestId,
        toolName: params.toolName,
        toolInput: params.toolInput,
        message: params.message,
        sessionId: params.sessionId,
        suggestions: params.suggestions,
      });
    });
  }

  /**
   * Handle a user's permission response from the WebSocket.
   * Accepts both legacy simple "allow"/"deny" and rich responses.
   */
  handleResponse(
    requestId: string,
    decision: "allow" | "deny",
    updatedInput?: Record<string, unknown>,
    acceptedSuggestionIndices?: number[],
  ): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    entry.resolve({ decision, updatedInput, acceptedSuggestionIndices });
    return true;
  }

  /**
   * Deny all pending permission requests for a user (e.g. on WebSocket disconnect).
   */
  cancelForUser(userId: string): void {
    for (const [id, entry] of this.pending) {
      if (entry.userId === userId) {
        clearTimeout(entry.timer);
        this.pending.delete(id);
        entry.resolve({ decision: "deny" });
      }
    }
  }
}

export const permissionManager = new PermissionManager();
