/**
 * Web channel — browser-based chat UI with WebSocket for real-time bidirectional communication.
 *
 * Auth: dual-mode — admin token (full access) or invite code (chat only).
 *
 * Routes:
 *   GET  /                    → Chat UI HTML (admin token or invite code)
 *   GET  /admin               → Admin panel (admin token only)
 *   WS   /api/ws              → WebSocket connection (admin token or invite code)
 *   POST /api/upload          → File upload
 *   GET  /api/history         → Session message history
 *   GET  /api/sessions        → List sessions (scoped by token)
 *   DELETE /api/sessions      → Delete session
 *   GET/POST/DELETE /api/admin/invites → Invite code management (admin only)
 *   GET  /api/health          → Health check (no auth)
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { writeFileSync, mkdirSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { ChannelPlugin } from "./types.js";
import type {
  Handler,
  ToolEventCallback,
  StreamChunkCallback,
  PermissionRequestCallback,
  PermissionRequest,
} from "../types.js";
import type { WebConfig } from "../types.js";
import { loadWebConfig, CONFIG_FILE } from "../config.js";
import type { InboundMessage, MediaFile } from "../message.js";
import { getChatHtml } from "./web-ui.js";
import { getAdminHtml } from "./web-admin-ui.js";
import { startTunnel } from "./web-tunnel.js";
import { formatToolEvent, type ToolPayload } from "../tool-config.js";
import type { MessageStore } from "../message-store.js";
import type { InviteStore } from "../invite-store.js";
import type { SessionStore } from "../session-store.js";

// ---------------------------------------------------------------------------
// File upload storage
// ---------------------------------------------------------------------------

const UPLOAD_DIR = join(tmpdir(), "klaus-web-uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Message store (set by index.ts for /api/history)
// ---------------------------------------------------------------------------

let messageStoreRef: MessageStore | null = null;
let inviteStoreRef: InviteStore | null = null;
let sessionStoreRef: SessionStore | null = null;

export function setMessageStore(store: MessageStore): void {
  messageStoreRef = store;
}

export function setInviteStore(store: InviteStore): void {
  inviteStoreRef = store;
}

export function setSessionStore(store: SessionStore): void {
  sessionStoreRef = store;
}

// ---------------------------------------------------------------------------
// WebSocket client management
// ---------------------------------------------------------------------------

interface KlausWebSocket extends WebSocket {
  isAlive: boolean;
  klausToken: string;
  klausIp: string;
}

const wsClients = new Map<string, Set<KlausWebSocket>>();

type WsEvent =
  | {
      readonly type: "message";
      readonly text: string;
      readonly id: string;
      readonly sessionId?: string;
    }
  | {
      readonly type: "stream";
      readonly chunk: string;
      readonly sessionId?: string;
    }
  | { readonly type: "merged"; readonly sessionId?: string }
  | {
      readonly type: "error";
      readonly message: string;
      readonly sessionId?: string;
    }
  | { readonly type: "ping" }
  | {
      readonly type: "tool";
      readonly data: ToolPayload;
      readonly sessionId?: string;
    }
  | {
      readonly type: "permission";
      readonly data: PermissionRequest;
      readonly sessionId?: string;
    }
  | { readonly type: "config_updated" };

function addWsClient(token: string, ws: KlausWebSocket): void {
  let clients = wsClients.get(token);
  if (!clients) {
    clients = new Set();
    wsClients.set(token, clients);
  }
  clients.add(ws);
}

function removeWsClient(token: string, ws: KlausWebSocket): void {
  const clients = wsClients.get(token);
  if (!clients) return;
  clients.delete(ws);
  if (clients.size === 0) wsClients.delete(token);
}

function sendWsEvent(token: string, event: WsEvent): void {
  const clients = wsClients.get(token);
  if (!clients) return;
  const data = JSON.stringify(event);
  for (const ws of [...clients]) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch {
        removeWsClient(token, ws);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Token validation (constant-time, fixed-length comparison)
// ---------------------------------------------------------------------------

function validateToken(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  // HMAC both values to fixed-length digests, preventing length leakage
  const key = "klaus-token-compare";
  const a = createHmac("sha256", key).update(provided).digest();
  const b = createHmac("sha256", key).update(expected).digest();
  return timingSafeEqual(a, b);
}

// Derive a short prefix for logging (never log the full token)
function tokenLabel(token: string): string {
  return token.slice(0, 8) + "...";
}

// ---------------------------------------------------------------------------
// Auth: admin token + invite code dual validation
// ---------------------------------------------------------------------------

type AuthResult =
  | { readonly kind: "admin"; readonly token: string }
  | { readonly kind: "invite"; readonly token: string }
  | { readonly kind: "invalid" };

function authenticate(provided: string, cfg: WebConfig): AuthResult {
  if (!provided) return { kind: "invalid" };
  if (validateToken(provided, cfg.token)) {
    return { kind: "admin", token: provided };
  }
  if (inviteStoreRef?.isValid(provided)) {
    return { kind: "invite", token: provided };
  }
  return { kind: "invalid" };
}

// ---------------------------------------------------------------------------
// Rate limiting (per-IP, simple sliding window)
// ---------------------------------------------------------------------------

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 60;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_MAX_REQUESTS;
}

// ---------------------------------------------------------------------------
// Pending permission requests (deferred promises for canUseTool approval)
// ---------------------------------------------------------------------------

const PERMISSION_TIMEOUT_MS = 120_000; // 2 minutes

const pendingPermissions = new Map<
  string,
  {
    resolve: (response: { allow: boolean }) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage, maxSize?: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const limit = maxSize ?? 1024 * 64; // default 64 KB
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(
  req: IncomingMessage,
): Promise<Record<string, unknown> | null> {
  try {
    const buf = await readBody(req, 4096);
    return JSON.parse(buf.toString("utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function serveHtml(_url: URL, res: ServerResponse, _cfg: WebConfig): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(getChatHtml());
}

function serveAdmin(
  _req: IncomingMessage,
  _url: URL,
  res: ServerResponse,
  _cfg: WebConfig,
): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(getAdminHtml());
}

// ---------------------------------------------------------------------------
// Message processing (shared by WebSocket handler)
// ---------------------------------------------------------------------------

async function processUserMessage(
  token: string,
  text: string,
  fileIds: string[],
  sessionId: string,
  handler: Handler,
  cfg: WebConfig,
): Promise<void> {
  const trimmedText = text.trim();
  if (!trimmedText && fileIds.length === 0) return;

  // Build media list from uploaded file IDs
  const media: MediaFile[] = [];
  for (const fileId of fileIds) {
    const meta = uploadedFiles.get(fileId);
    if (!meta) continue;
    media.push({
      type: meta.mediaType,
      path: meta.path,
      fileName: meta.originalName,
    });
    uploadedFiles.delete(fileId);
  }

  const sessionKey = `web:${token}:${sessionId}`;
  const hasMedia = media.length > 0;
  const messageType =
    hasMedia && trimmedText
      ? "mixed"
      : hasMedia
        ? media[0].type === "image"
          ? "image"
          : "file"
        : "text";
  const msg: InboundMessage = {
    sessionKey,
    text: trimmedText,
    messageType,
    chatType: "private",
    senderId: token,
    ...(hasMedia ? { media } : {}),
  };

  const mediaLabel = hasMedia ? ` +${media.length} file(s)` : "";
  console.log(
    `[Web] Received (web:${tokenLabel(token)}): ${trimmedText.slice(0, 120)}${mediaLabel}`,
  );

  // Stream tool events to the client via WebSocket
  const onToolEvent: ToolEventCallback = (event) => {
    try {
      sendWsEvent(token, {
        type: "tool",
        data: formatToolEvent(event),
        sessionId,
      });
    } catch (err) {
      console.error("[Web] Failed to send tool event:", err);
    }
  };

  // Stream text chunks to the client via WebSocket
  const onStreamChunk: StreamChunkCallback = (chunk) => {
    try {
      sendWsEvent(token, { type: "stream", chunk, sessionId });
    } catch (err) {
      console.error("[Web] Failed to send stream chunk:", err);
    }
  };

  // Permission request callback (only when permissions enabled)
  const onPermissionRequest: PermissionRequestCallback | undefined =
    cfg.permissions
      ? (request) => {
          return new Promise<{ allow: boolean }>((resolve) => {
            const timer = setTimeout(() => {
              pendingPermissions.delete(request.requestId);
              console.log(
                `[Web] Permission timeout for ${request.toolName} (${request.requestId})`,
              );
              resolve({ allow: false });
            }, PERMISSION_TIMEOUT_MS);
            pendingPermissions.set(request.requestId, { resolve, timer });
            sendWsEvent(token, {
              type: "permission",
              data: request,
              sessionId,
            });
          });
        }
      : undefined;

  try {
    const reply = await handler(
      msg,
      onToolEvent,
      onStreamChunk,
      onPermissionRequest,
    );
    if (reply === null) {
      console.log("[Web] Message merged into batch, skipping reply");
      sendWsEvent(token, { type: "merged", sessionId });
      return;
    }

    console.log(`[Web] Replying: ${reply.slice(0, 100)}...`);
    sendWsEvent(token, {
      type: "message",
      text: reply,
      id: Date.now().toString(36),
      sessionId,
    });
  } catch (err) {
    console.error("[Web] Handler error:", err);
    sendWsEvent(token, {
      type: "error",
      message: "An internal error occurred. Please try again.",
      sessionId,
    });
  }
}

// ---------------------------------------------------------------------------
// WebSocket message handler
// ---------------------------------------------------------------------------

type ClientWsMessage =
  | { type: "message"; text?: string; sessionId?: string; files?: string[] }
  | { type: "permission"; requestId: string; allow: boolean }
  | { type: "pong" };

function handleWsMessage(
  ws: KlausWebSocket,
  raw: RawData,
  handler: Handler,
  cfg: WebConfig,
): void {
  let parsed: ClientWsMessage;
  try {
    parsed = JSON.parse(raw.toString()) as ClientWsMessage;
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
    return;
  }

  const token = ws.klausToken;
  const ip = ws.klausIp;

  switch (parsed.type) {
    case "message": {
      if (!checkRateLimit(ip)) {
        ws.send(
          JSON.stringify({ type: "error", message: "too many requests" }),
        );
        return;
      }
      processUserMessage(
        token,
        parsed.text ?? "",
        parsed.files ?? [],
        parsed.sessionId ?? "default",
        handler,
        cfg,
      ).catch((err) => {
        console.error("[Web] processUserMessage error:", err);
      });
      break;
    }
    case "permission": {
      if (!checkRateLimit(ip)) {
        ws.send(
          JSON.stringify({ type: "error", message: "too many requests" }),
        );
        return;
      }
      const requestId = parsed.requestId ?? "";
      const pending = pendingPermissions.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingPermissions.delete(requestId);
        pending.resolve({ allow: Boolean(parsed.allow) });
      }
      break;
    }
    case "pong":
      // Client heartbeat reply, no action needed
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// File upload handler
// ---------------------------------------------------------------------------

interface UploadMeta {
  readonly path: string;
  readonly originalName: string;
  readonly mediaType: "image" | "audio" | "video" | "file";
  readonly createdAt: number;
}

const uploadedFiles = new Map<string, UploadMeta>();

// Cleanup stale uploads every 10 minutes (files older than 30 min)
setInterval(() => {
  const cutoff = Date.now() - 30 * 60_000;
  for (const [id, meta] of uploadedFiles) {
    if (meta.createdAt < cutoff) uploadedFiles.delete(id);
  }
}, 10 * 60_000);

function inferMediaType(
  contentType: string,
  fileName: string,
): "image" | "audio" | "video" | "file" {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("video/")) return "video";
  // Fallback: check extension
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext))
    return "image";
  if (["mp3", "wav", "ogg", "m4a", "aac"].includes(ext)) return "audio";
  if (["mp4", "webm", "mov", "avi"].includes(ext)) return "video";
  return "file";
}

async function handleUpload(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: WebConfig,
): Promise<void> {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    jsonResponse(res, 429, { error: "too many requests" });
    return;
  }

  // Token in query string for upload
  const url = new URL(req.url ?? "/", `http://localhost:${cfg.port}`);
  const token = url.searchParams.get("token") ?? "";
  const auth = authenticate(token, cfg);
  if (auth.kind === "invalid") {
    jsonResponse(res, 401, { error: "unauthorized" });
    return;
  }

  const contentType = req.headers["content-type"] ?? "";
  const fileName = decodeURIComponent(url.searchParams.get("name") ?? "upload");

  // Validate content type is present
  if (!contentType) {
    jsonResponse(res, 400, { error: "missing content-type" });
    return;
  }

  const data = await readBody(req, MAX_UPLOAD_SIZE);

  // Save to temp file
  const safeBase = fileName.replace(/[^\w.\-]/g, "_");
  const diskName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeBase}`;
  const filePath = join(UPLOAD_DIR, diskName);
  writeFileSync(filePath, data);

  const fileId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const mediaType = inferMediaType(contentType, fileName);

  uploadedFiles.set(fileId, {
    path: filePath,
    originalName: fileName,
    mediaType,
    createdAt: Date.now(),
  });

  console.log(
    `[Web] Upload (${tokenLabel(token)}): ${fileName} → ${mediaType} [${data.length} bytes]`,
  );

  jsonResponse(res, 200, { id: fileId, type: mediaType, name: fileName });
}

// ---------------------------------------------------------------------------
// Admin: shared auth guard
// ---------------------------------------------------------------------------

function adminAuth(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  cfg: WebConfig,
): boolean {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    jsonResponse(res, 429, { error: "too many requests" });
    return false;
  }
  const token = url.searchParams.get("token") ?? "";
  if (!validateToken(token, cfg.token)) {
    jsonResponse(res, 401, { error: "admin access required" });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Admin: invite code CRUD
// ---------------------------------------------------------------------------

async function handleAdminInvites(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  cfg: WebConfig,
): Promise<void> {
  if (!adminAuth(req, res, url, cfg)) return;

  if (!inviteStoreRef) {
    jsonResponse(res, 503, { error: "invite store unavailable" });
    return;
  }

  if (req.method === "GET") {
    const invites = inviteStoreRef.list();

    // Attach usage stats per invite code
    const msgStore = messageStoreRef;
    if (msgStore) {
      const enriched = await Promise.all(
        invites.map(async (inv) => {
          const prefix = `web:${inv.code}:`;
          const sessions = await msgStore.listSessions(prefix);
          const totalMessages = sessions.reduce(
            (sum, s) => sum + s.messageCount,
            0,
          );
          const lastActive =
            sessions.length > 0 ? sessions[0].updatedAt : inv.createdAt;
          return {
            ...inv,
            sessionCount: sessions.length,
            totalMessages,
            lastActive,
          };
        }),
      );

      // Also compute admin's own stats
      const adminPrefix = `web:${cfg.token}:`;
      const adminSessions = await msgStore.listSessions(adminPrefix);
      const adminMessages = adminSessions.reduce(
        (sum, s) => sum + s.messageCount,
        0,
      );

      jsonResponse(res, 200, {
        invites: enriched,
        admin: {
          sessionCount: adminSessions.length,
          totalMessages: adminMessages,
          lastActive: adminSessions.length > 0 ? adminSessions[0].updatedAt : 0,
        },
      });
      return;
    }

    jsonResponse(res, 200, { invites });
    return;
  }

  if (req.method === "POST") {
    const body = await readBody(req, 1024);
    let label = "";
    try {
      const parsed = JSON.parse(body.toString()) as Record<string, unknown>;
      label =
        typeof parsed.label === "string" ? parsed.label.slice(0, 100) : "";
    } catch {
      // Empty label is fine
    }
    const invite = inviteStoreRef.create(label);
    console.log(
      `[Web] Created invite code: ${tokenLabel(invite.code)} (label: ${label || "(none)"})`,
    );
    jsonResponse(res, 201, { invite });
    return;
  }

  if (req.method === "DELETE") {
    const code = url.searchParams.get("code") ?? "";
    if (!code) {
      jsonResponse(res, 400, { error: "missing code parameter" });
      return;
    }
    const deleted = inviteStoreRef.delete(code);
    if (!deleted) {
      jsonResponse(res, 404, { error: "invite code not found" });
      return;
    }
    console.log(`[Web] Deleted invite code: ${tokenLabel(code)}`);
    jsonResponse(res, 200, { deleted: true });
    return;
  }

  jsonResponse(res, 405, { error: "method not allowed" });
}

// ---------------------------------------------------------------------------
// Admin: validate "code" param (must be "_admin" or 32-char hex invite code)
// ---------------------------------------------------------------------------

const VALID_CODE_RE = /^(?:_admin|[0-9a-f]{32})$/;

// ---------------------------------------------------------------------------
// Admin: browse sessions for any token (admin or invite code)
// ---------------------------------------------------------------------------

async function handleAdminSessions(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  cfg: WebConfig,
): Promise<void> {
  if (!adminAuth(req, res, url, cfg)) return;
  if (req.method !== "GET") {
    jsonResponse(res, 405, { error: "method not allowed" });
    return;
  }
  if (!messageStoreRef) {
    jsonResponse(res, 503, { error: "unavailable" });
    return;
  }

  // "code" param: the invite code, or "_admin" for admin's own sessions
  const code = url.searchParams.get("code") ?? "";
  if (!code || !VALID_CODE_RE.test(code)) {
    jsonResponse(res, 400, { error: "missing or invalid code parameter" });
    return;
  }

  const effectiveToken = code === "_admin" ? cfg.token : code;
  const prefix = `web:${effectiveToken}:`;
  const sessions = await messageStoreRef.listSessions(prefix);

  // Enrich with model info from SessionStore
  const enriched = sessions.map((s) => {
    const sessionKey = `web:${effectiveToken}:${s.sessionId}`;
    const persisted = sessionStoreRef?.get(sessionKey);
    return { ...s, model: persisted?.model ?? null };
  });

  jsonResponse(res, 200, { sessions: enriched });
}

// ---------------------------------------------------------------------------
// Admin: read conversation history for any session
// ---------------------------------------------------------------------------

async function handleAdminHistory(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  cfg: WebConfig,
): Promise<void> {
  if (!adminAuth(req, res, url, cfg)) return;
  if (req.method !== "GET") {
    jsonResponse(res, 405, { error: "method not allowed" });
    return;
  }
  if (!messageStoreRef) {
    jsonResponse(res, 503, { error: "unavailable" });
    return;
  }

  const code = url.searchParams.get("code") ?? "";
  const sessionId = url.searchParams.get("sessionId") ?? "";
  if (!code || !VALID_CODE_RE.test(code)) {
    jsonResponse(res, 400, { error: "missing or invalid code parameter" });
    return;
  }
  if (!sessionId || !/^[\w\-]{1,64}$/.test(sessionId)) {
    jsonResponse(res, 400, { error: "missing or invalid sessionId" });
    return;
  }

  const effectiveToken = code === "_admin" ? cfg.token : code;
  const sessionKey = `web:${effectiveToken}:${sessionId}`;
  const messages = await messageStoreRef.readHistory(sessionKey);

  jsonResponse(res, 200, { messages });
}

// ---------------------------------------------------------------------------
// Request router (HTTP-only routes)
// ---------------------------------------------------------------------------

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: WebConfig,
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${cfg.port}`);

  switch (url.pathname) {
    case "/":
      return serveHtml(url, res, cfg);
    case "/admin":
      return serveAdmin(req, url, res, cfg);
    case "/api/admin/invites":
      return handleAdminInvites(req, res, url, cfg);
    case "/api/admin/sessions":
      return handleAdminSessions(req, res, url, cfg);
    case "/api/admin/history":
      return handleAdminHistory(req, res, url, cfg);
    case "/api/auth": {
      if (req.method !== "POST") {
        jsonResponse(res, 405, { error: "method not allowed" });
        return;
      }
      const authIp = getClientIp(req);
      if (!checkRateLimit(authIp)) {
        jsonResponse(res, 429, { error: "too many requests" });
        return;
      }
      const body = await readJsonBody(req);
      if (!body) {
        jsonResponse(res, 400, { error: "invalid JSON body" });
        return;
      }
      const authToken = (body.token as string) ?? "";
      const authResult = authenticate(authToken, cfg);
      jsonResponse(res, 200, {
        valid: authResult.kind !== "invalid",
        isAdmin: authResult.kind === "admin",
      });
      return;
    }
    case "/api/upload":
      if (req.method !== "POST") {
        jsonResponse(res, 405, { error: "method not allowed" });
        return;
      }
      return handleUpload(req, res, cfg);
    case "/api/history": {
      if (req.method !== "GET") {
        jsonResponse(res, 405, { error: "method not allowed" });
        return;
      }
      const histIp = getClientIp(req);
      if (!checkRateLimit(histIp)) {
        jsonResponse(res, 429, { error: "too many requests" });
        return;
      }
      const histToken = url.searchParams.get("token") ?? "";
      const histAuth = authenticate(histToken, cfg);
      if (histAuth.kind === "invalid") {
        jsonResponse(res, 401, { error: "unauthorized" });
        return;
      }
      const histSessionId = url.searchParams.get("sessionId") ?? "default";
      if (!/^[\w\-]{1,64}$/.test(histSessionId)) {
        jsonResponse(res, 400, { error: "invalid sessionId" });
        return;
      }
      if (!messageStoreRef) {
        jsonResponse(res, 503, { error: "history unavailable" });
        return;
      }
      const histKey = `web:${histToken}:${histSessionId}`;
      const limitStr = url.searchParams.get("limit") ?? "200";
      const limit = Math.min(Math.max(parseInt(limitStr, 10) || 200, 1), 500);
      const all = await messageStoreRef.readHistory(histKey);
      const messages = all.length > limit ? all.slice(-limit) : all;
      jsonResponse(res, 200, { messages, total: all.length });
      return;
    }
    case "/api/sessions": {
      const sessIp = getClientIp(req);
      if (!checkRateLimit(sessIp)) {
        jsonResponse(res, 429, { error: "too many requests" });
        return;
      }
      const sessToken = url.searchParams.get("token") ?? "";
      const sessAuth = authenticate(sessToken, cfg);
      if (sessAuth.kind === "invalid") {
        jsonResponse(res, 401, { error: "unauthorized" });
        return;
      }
      if (!messageStoreRef) {
        jsonResponse(res, 503, { error: "sessions unavailable" });
        return;
      }

      if (req.method === "GET") {
        const prefix = `web:${sessToken}:`;
        const sessions = await messageStoreRef.listSessions(prefix);
        jsonResponse(res, 200, {
          sessions,
          isAdmin: sessAuth.kind === "admin",
        });
        return;
      }

      if (req.method === "DELETE") {
        const delSessionId = url.searchParams.get("sessionId") ?? "";
        if (!/^[\w\-]{1,64}$/.test(delSessionId)) {
          jsonResponse(res, 400, { error: "invalid sessionId" });
          return;
        }
        const delKey = `web:${sessToken}:${delSessionId}`;
        const deleted = messageStoreRef.deleteSession(delKey);
        if (!deleted) {
          jsonResponse(res, 404, { error: "session not found" });
          return;
        }
        jsonResponse(res, 200, { deleted: true });
        return;
      }

      jsonResponse(res, 405, { error: "method not allowed" });
      return;
    }
    case "/api/health":
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    default:
      res.writeHead(404);
      res.end("not found");
  }
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const webPlugin: ChannelPlugin = {
  meta: {
    id: "web",
    label: "Web Chat",
    description:
      "Browser-based chat UI (localhost + optional Cloudflare Tunnel)",
  },
  capabilities: {
    dm: true,
  },
  start: async (handler: Handler) => {
    const cfg = loadWebConfig();

    const server = createServer((req, res) => {
      handleRequest(req, res, cfg).catch((err) => {
        console.error("[Web] Request error:", err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("internal error");
        }
      });
    });

    // WebSocket server (noServer mode — manual upgrade handling)
    const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

    server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", `http://localhost:${cfg.port}`);
      if (url.pathname !== "/api/ws") {
        socket.destroy();
        return;
      }
      const token = url.searchParams.get("token") ?? "";
      const auth = authenticate(token, cfg);
      if (auth.kind === "invalid") {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req, token);
      });
    });

    wss.on(
      "connection",
      (rawWs: WebSocket, req: IncomingMessage, token: string) => {
        const ws = rawWs as KlausWebSocket;
        ws.isAlive = true;
        ws.klausToken = token;
        ws.klausIp = getClientIp(req);

        addWsClient(token, ws);
        console.log(`[Web] WebSocket connected: ${tokenLabel(token)}`);

        ws.on("pong", () => {
          ws.isAlive = true;
        });

        ws.on("message", (raw: RawData) => {
          handleWsMessage(ws, raw, handler, cfg);
        });

        ws.on("close", () => {
          removeWsClient(token, ws);
          console.log(`[Web] WebSocket disconnected: ${tokenLabel(token)}`);
        });

        ws.on("error", (err) => {
          console.error(
            `[Web] WebSocket error (${tokenLabel(token)}):`,
            err.message,
          );
          removeWsClient(token, ws);
        });
      },
    );

    server.listen(cfg.port, "0.0.0.0", () => {
      console.log(
        `Klaus Web channel listening on http://localhost:${cfg.port}`,
      );
      console.log(`Chat URL: http://localhost:${cfg.port}/?token=${cfg.token}`);
      console.log(
        `Admin URL: http://localhost:${cfg.port}/admin?token=${cfg.token}`,
      );
    });

    // Config file watcher — notify clients when config.yaml changes externally
    let configWatcher: FSWatcher | null = null;
    let configDebounce: ReturnType<typeof setTimeout> | null = null;
    try {
      configWatcher = watch(CONFIG_FILE, () => {
        if (configDebounce) clearTimeout(configDebounce);
        configDebounce = setTimeout(() => {
          configDebounce = null;
          console.log("[Web] Config file changed, notifying clients");
          const data = JSON.stringify({ type: "config_updated" });
          for (const [, clients] of wsClients) {
            for (const ws of [...clients]) {
              if (ws.readyState === WebSocket.OPEN) {
                try {
                  ws.send(data);
                } catch {
                  /* ignore */
                }
              }
            }
          }
        }, 500);
      });
    } catch {
      // config.yaml may not exist yet — non-fatal
    }

    // Application-layer ping — 25s keepalive to prevent proxy/tunnel timeouts
    const keepalive = setInterval(() => {
      for (const [token, clients] of wsClients) {
        for (const ws of [...clients]) {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: "ping" }));
            } catch {
              removeWsClient(token, ws);
            }
          } else {
            removeWsClient(token, ws);
          }
        }
      }
    }, 25_000);

    // Protocol-layer ping/pong — detect dead connections
    const deadCheck = setInterval(() => {
      for (const client of wss.clients) {
        const ws = client as KlausWebSocket;
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30_000);

    // Tunnel (Cloudflare / ngrok / custom)
    let tunnelResult: import("./web-tunnel.js").TunnelResult | null = null;
    if (cfg.tunnel !== false) {
      tunnelResult = startTunnel(cfg.tunnel, cfg.port, cfg.token);
    }

    // Cleanup on process exit
    const cleanup = (): void => {
      clearInterval(keepalive);
      clearInterval(deadCheck);
      if (configDebounce) clearTimeout(configDebounce);
      configWatcher?.close();
      wss.close();
      tunnelResult?.child?.kill();
    };
    process.once("exit", cleanup);
    process.once("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.once("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });

    // Block forever (channel contract)
    await new Promise(() => {});
  },
};
