/**
 * Web channel — browser-based chat UI with SSE for real-time replies.
 *
 * Routes:
 *   GET  /              → Chat UI HTML (requires ?token)
 *   GET  /api/events    → SSE stream (requires ?token)
 *   POST /api/message   → Send user message (token in JSON body)
 *   GET  /api/health    → Health check (no auth)
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ChannelPlugin } from "./types.js";
import type { Handler } from "../types.js";
import type { WebConfig } from "../types.js";
import { loadWebConfig } from "../config.js";
import type { InboundMessage } from "../message.js";
import { getChatHtml } from "./web-ui.js";
import { startTunnel } from "./web-tunnel.js";

// ---------------------------------------------------------------------------
// SSE client management
// ---------------------------------------------------------------------------

const sseClients = new Map<string, Set<ServerResponse>>();

type SseEvent =
  | { readonly type: "message"; readonly text: string; readonly id: string }
  | { readonly type: "merged" }
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "ping" };

function addSseClient(token: string, res: ServerResponse): void {
  let clients = sseClients.get(token);
  if (!clients) {
    clients = new Set();
    sseClients.set(token, clients);
  }
  clients.add(res);
}

function removeSseClient(token: string, res: ServerResponse): void {
  const clients = sseClients.get(token);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) sseClients.delete(token);
}

function sendSseEvent(token: string, event: SseEvent): void {
  const clients = sseClients.get(token);
  if (!clients) return;
  const data = JSON.stringify(event);
  for (const res of clients) {
    try {
      const ok = res.write(`data: ${data}\n\n`);
      if (!ok) removeSseClient(token, res);
    } catch {
      removeSseClient(token, res);
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
// HTTP helpers
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX = 1024 * 64; // 64 KB
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX) {
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
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

function serveHtml(
  url: URL,
  res: ServerResponse,
  cfg: WebConfig,
): void {
  const token = url.searchParams.get("token") ?? "";
  if (!validateToken(token, cfg.token)) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized: invalid or missing token");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(getChatHtml());
}

function handleSse(
  req: IncomingMessage,
  url: URL,
  res: ServerResponse,
  cfg: WebConfig,
): void {
  const token = url.searchParams.get("token") ?? "";
  if (!validateToken(token, cfg.token)) {
    res.writeHead(401);
    res.end("unauthorized");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("\n"); // initial flush

  addSseClient(token, res);

  req.on("close", () => {
    removeSseClient(token, res);
  });
}

async function handleMessage(
  req: IncomingMessage,
  res: ServerResponse,
  handler: Handler,
  cfg: WebConfig,
): Promise<void> {
  // Rate limiting
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    jsonResponse(res, 429, { error: "too many requests" });
    return;
  }

  const body = await readBody(req);
  let parsed: { token?: string; text?: string };
  try {
    parsed = JSON.parse(body) as { token?: string; text?: string };
  } catch {
    jsonResponse(res, 400, { error: "invalid JSON" });
    return;
  }

  const token = parsed.token ?? "";
  if (!validateToken(token, cfg.token)) {
    jsonResponse(res, 401, { error: "unauthorized" });
    return;
  }

  const text = (parsed.text ?? "").trim();
  if (!text) {
    jsonResponse(res, 400, { error: "empty message" });
    return;
  }

  // Respond immediately (async processing, same as wecom.ts pattern)
  jsonResponse(res, 200, { ok: true });

  const sessionKey = `web:${token}`;
  const msg: InboundMessage = {
    sessionKey,
    text,
    messageType: "text",
    chatType: "private",
    senderId: token,
  };

  console.log(
    `[Web] Received (web:${tokenLabel(token)}): ${text.slice(0, 120)}`,
  );

  try {
    const reply = await handler(msg);
    if (reply === null) {
      console.log("[Web] Message merged into batch, skipping reply");
      sendSseEvent(token, { type: "merged" });
      return;
    }

    console.log(`[Web] Replying: ${reply.slice(0, 100)}...`);
    sendSseEvent(token, {
      type: "message",
      text: reply,
      id: Date.now().toString(36),
    });
  } catch (err) {
    console.error("[Web] Handler error:", err);
    sendSseEvent(token, {
      type: "error",
      message: "An internal error occurred. Please try again.",
    });
  }
}

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  handler: Handler,
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
    case "/api/events":
      return handleSse(req, url, res, cfg);
    case "/api/message":
      if (req.method !== "POST") {
        jsonResponse(res, 405, { error: "method not allowed" });
        return;
      }
      return handleMessage(req, res, handler, cfg);
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
      handleRequest(req, res, handler, cfg).catch((err) => {
        console.error("[Web] Request error:", err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("internal error");
        }
      });
    });

    server.listen(cfg.port, "0.0.0.0", () => {
      console.log(
        `Klaus Web channel listening on http://localhost:${cfg.port}`,
      );
      console.log(
        `Chat URL: http://localhost:${cfg.port}/?token=${cfg.token}`,
      );
    });

    // SSE keepalive — 30s ping to prevent proxy/tunnel timeouts
    const keepalive = setInterval(() => {
      for (const [token, clients] of sseClients) {
        for (const client of clients) {
          try {
            const ok = client.write(
              `data: ${JSON.stringify({ type: "ping" })}\n\n`,
            );
            if (!ok) removeSseClient(token, client);
          } catch {
            removeSseClient(token, client);
          }
        }
      }
    }, 30_000);

    // Cloudflare Tunnel
    let tunnelChild: ReturnType<typeof startTunnel> = null;
    if (cfg.tunnel) {
      tunnelChild = startTunnel(cfg.port);
    }

    // Cleanup on process exit
    const cleanup = (): void => {
      clearInterval(keepalive);
      tunnelChild?.kill();
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
