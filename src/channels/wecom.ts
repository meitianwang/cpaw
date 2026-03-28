/**
 * WeCom (企业微信) smart bot channel plugin for Klaus.
 * Aligned with openclaw-china/extensions/wecom.
 *
 * Uses @wecom/aibot-node-sdk WebSocket mode for real-time messaging.
 * Supports direct messages and group chats.
 */

import crypto from "node:crypto";
import { WSClient, type WsFrame } from "@wecom/aibot-node-sdk";
import type { ChannelPlugin } from "./types.js";
import type { Handler } from "../types.js";
import type { InboundMessage, MessageType } from "../message.js";
import type { WecomConfig, WecomInboundMessage } from "./wecom-types.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let wecomConfig: WecomConfig | undefined;
let transcriptAppend: ((sessionKey: string, role: "user" | "assistant", text: string) => Promise<void>) | undefined;
let notifyWebClients: ((sessionKey: string, role: "user" | "assistant", text: string) => void) | undefined;

export type { WecomConfig } from "./wecom-types.js";

export function setWecomConfig(config: WecomConfig): void {
  wecomConfig = config;
}

export function setWecomTranscript(
  append: (sessionKey: string, role: "user" | "assistant", text: string) => Promise<void>,
): void {
  transcriptAppend = append;
}

export function setWecomNotify(
  notify: (sessionKey: string, role: "user" | "assistant", text: string) => void,
): void {
  notifyWebClients = notify;
}

function getConfig(): WecomConfig {
  if (!wecomConfig) throw new Error("WeCom config not set");
  return wecomConfig;
}

// ---------------------------------------------------------------------------
// Message parsing
// ---------------------------------------------------------------------------

function extractText(msg: WecomInboundMessage): { text: string; contentType: MessageType } {
  const msgtype = msg.msgtype ?? "";

  if (msgtype === "text" && msg.text?.content) {
    return { text: msg.text.content.trim(), contentType: "text" };
  }
  if (msgtype === "voice" && msg.voice?.content) {
    return { text: msg.voice.content.trim(), contentType: "text" };
  }
  if (msgtype === "image") {
    return { text: "[图片]", contentType: "image" };
  }
  if (msgtype === "file") {
    const name = msg.file?.filename ?? "file";
    return { text: `[文件: ${name}]`, contentType: "file" };
  }
  if (msgtype === "event") {
    return { text: "", contentType: "text" };
  }

  return { text: `[${msgtype || "unknown"}]`, contentType: "text" };
}

function resolveTarget(msg: WecomInboundMessage): { chatType: "private" | "group"; peerId: string } {
  const chattype = String(msg.chattype ?? "").toLowerCase();
  if (chattype === "group") {
    const chatId = String(msg.chatid ?? "").trim() || "unknown";
    return { chatType: "group", peerId: chatId };
  }
  const userId = String(msg.from?.userid ?? "").trim() || "unknown";
  return { chatType: "private", peerId: userId };
}

// ---------------------------------------------------------------------------
// Message dedup (in-memory, 60s TTL)
// ---------------------------------------------------------------------------

const processedMessages = new Map<string, number>();
const MESSAGE_DEDUP_TTL_MS = 60_000;
const MESSAGE_DEDUP_MAX_ENTRIES = 10_000;

function isDuplicate(key: string): boolean {
  const now = Date.now();
  const prev = processedMessages.get(key);
  if (typeof prev === "number" && now - prev < MESSAGE_DEDUP_TTL_MS) {
    return true;
  }

  processedMessages.set(key, now);

  if (processedMessages.size > MESSAGE_DEDUP_MAX_ENTRIES) {
    for (const [k, ts] of processedMessages) {
      if (now - ts > MESSAGE_DEDUP_TTL_MS) processedMessages.delete(k);
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Credential probe (quick connect → authenticate → disconnect)
// ---------------------------------------------------------------------------

export async function probeWecomCredentials(
  config: WecomConfig,
  timeoutMs = 15_000,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { client.disconnect(); } catch { /* ignore */ }
      resolve({ ok: false, error: "Connection timed out. Check Bot ID and Secret." });
    }, timeoutMs);

    const client = new WSClient({
      botId: config.botId,
      secret: config.secret,
      maxReconnectAttempts: 0,
      maxAuthFailureAttempts: 1,
      heartbeatInterval: 30_000,
      requestTimeout: timeoutMs - 1_000,
    });

    client.on("authenticated", () => {
      clearTimeout(timer);
      try { client.disconnect(); } catch { /* ignore */ }
      resolve({ ok: true });
    });

    client.on("error", (err) => {
      clearTimeout(timer);
      try { client.disconnect(); } catch { /* ignore */ }
      resolve({ ok: false, error: err.message });
    });

    try {
      client.connect();
    } catch (err) {
      clearTimeout(timer);
      resolve({ ok: false, error: String(err) });
    }
  });
}

// Module-level client reference for deliver() support
let activeClient: WSClient | undefined;

export const wecomPlugin: ChannelPlugin = {
  meta: {
    id: "wecom",
    label: "WeCom",
    description: "企业微信智能机器人（WebSocket 长连接）",
  },

  capabilities: {
    dm: true,
    group: true,
  },

  start: async (handler: Handler) => {
    const config = getConfig();

    console.log("[WeCom] Starting (mode=ws)");

    const client = new WSClient({
      botId: config.botId,
      secret: config.secret,
      maxReconnectAttempts: -1,
      heartbeatInterval: 30_000,
      reconnectInterval: 1_000,
    });
    activeClient = client;

    client.on("authenticated", () => {
      console.log("[WeCom] WebSocket authenticated");
    });

    client.on("reconnecting", (attempt) => {
      console.log(`[WeCom] Reconnecting (attempt=${attempt})`);
    });

    client.on("error", (error) => {
      console.error("[WeCom] SDK error:", error.message);
    });

    client.on("disconnected", (reason) => {
      console.log(`[WeCom] Disconnected: ${reason}`);
    });

    // Handle inbound messages
    client.on("message", (frame: WsFrame) => {
      const msg = frame.body as WecomInboundMessage | undefined;
      if (!msg) return;

      const reqId = frame.headers?.req_id;
      const msgId = msg.msgid;

      // Dedup
      const dedupeKey = msgId ? `wecom:${msgId}` : undefined;
      if (dedupeKey && isDuplicate(dedupeKey)) return;

      // Skip events (enter_chat etc.)
      if (msg.msgtype === "event") return;
      // Skip stream refresh signals
      if (msg.msgtype === "stream") return;

      const { text, contentType } = extractText(msg);
      if (!text.trim()) return;

      const { chatType, peerId } = resolveTarget(msg);
      const sessionKey = chatType === "private"
        ? `wecom:${msg.from?.userid ?? peerId}`
        : `wecom:${msg.chatid ?? peerId}`;

      const senderId = String(msg.from?.userid ?? "").trim();
      const preview = text.slice(0, 50);
      console.log(`[WeCom] Inbound: from=${senderId} chatType=${chatType} text="${preview}"`);

      const inbound: InboundMessage = {
        sessionKey,
        text,
        messageType: contentType,
        chatType,
        senderId,
        timestamp: Date.now(),
      };

      // Process asynchronously
      void (async () => {
        try {
          // Write user message to transcript + push to web
          if (transcriptAppend) {
            await transcriptAppend(sessionKey, "user", text);
          }
          if (notifyWebClients) notifyWebClients(sessionKey, "user", text);

          // Generate stream ID for streaming reply
          const streamId = crypto.randomBytes(16).toString("hex");
          const frameHeaders = { headers: { req_id: reqId ?? "" } };

          // Send "thinking" placeholder
          try {
            await client.replyStream(frameHeaders, streamId, "...", false);
          } catch {
            // Placeholder failure is non-fatal
          }

          const reply = await handler(inbound);
          if (reply) {
            // Write assistant reply to transcript + push to web
            if (transcriptAppend) {
              await transcriptAppend(sessionKey, "assistant", reply);
            }
            if (notifyWebClients) notifyWebClients(sessionKey, "assistant", reply);

            // Send final reply via streaming finish
            try {
              await client.replyStream(frameHeaders, streamId, reply, true);
            } catch (err) {
              console.error("[WeCom] Failed to send reply:", err);
              // Fallback: try sendMessage for proactive send
              try {
                const chatId = chatType === "private" ? senderId : (msg.chatid ?? peerId);
                await client.sendMessage(chatId, {
                  msgtype: "markdown",
                  markdown: { content: reply },
                });
              } catch (fallbackErr) {
                console.error("[WeCom] Fallback send also failed:", fallbackErr);
              }
            }
          }
        } catch (err) {
          console.error("[WeCom] Error handling message:", err);
        }
      })();
    });

    // Handle events (enter_chat welcome)
    client.on("event", (frame: WsFrame) => {
      const msg = frame.body as WecomInboundMessage | undefined;
      if (!msg) return;
      // Could add welcome message handling here if needed
    });

    // Connect
    client.connect();
    console.log("[WeCom] WebSocket client connecting...");

    // Block forever
    return new Promise<void>((resolve) => {
      const shutdown = () => {
        console.log("[WeCom] Shutting down...");
        activeClient = undefined;
        try { client.disconnect(); } catch { /* ignore */ }
        resolve();
      };
      process.once("SIGTERM", shutdown);
      process.once("SIGINT", shutdown);
    });
  },

  deliver: async (to: string, text: string) => {
    if (!activeClient) {
      console.warn(`[WeCom] deliver() skipped: no active connection (to=${to})`);
      return;
    }
    await activeClient.sendMessage(to, {
      msgtype: "markdown",
      markdown: { content: text },
    });
  },
};
