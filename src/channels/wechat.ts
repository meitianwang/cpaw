/**
 * WeChat channel plugin for Klaus.
 * Based on @tencent-weixin/openclaw-weixin.
 *
 * Uses long-polling (getUpdates) for message reception.
 * Authentication via QR code scan (no AppID/Secret needed).
 * context_token must be echoed back in every reply.
 */

import type { ChannelPlugin } from "./types.js";
import type { Handler } from "../types.js";
import type { InboundMessage, MessageType } from "../message.js";
import type { WechatConfig, WechatMessage } from "./wechat-types.js";
import { getUpdates, sendMessageWechat } from "./wechat-api.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let wechatConfig: WechatConfig | undefined;
let transcriptAppend: ((sessionKey: string, role: "user" | "assistant", text: string) => Promise<void>) | undefined;
let notifyWebClients: ((sessionKey: string, role: "user" | "assistant", text: string) => void) | undefined;

export type { WechatConfig } from "./wechat-types.js";

export function setWechatConfig(config: WechatConfig): void {
  wechatConfig = config;
}

export function setWechatTranscript(
  append: (sessionKey: string, role: "user" | "assistant", text: string) => Promise<void>,
): void {
  transcriptAppend = append;
}

export function setWechatNotify(
  notify: (sessionKey: string, role: "user" | "assistant", text: string) => void,
): void {
  notifyWebClients = notify;
}

function getConfig(): WechatConfig {
  if (!wechatConfig) throw new Error("WeChat config not set");
  return wechatConfig;
}

// ---------------------------------------------------------------------------
// Context token store (must echo back in every reply)
// ---------------------------------------------------------------------------

const contextTokens = new Map<string, string>();
const CONTEXT_TOKEN_MAX = 10_000;

function setContextToken(senderId: string, token: string): void {
  contextTokens.set(senderId, token);
  if (contextTokens.size > CONTEXT_TOKEN_MAX) {
    const oldest = contextTokens.keys().next().value;
    if (typeof oldest === "string") contextTokens.delete(oldest);
  }
}

// ---------------------------------------------------------------------------
// Message parsing
// ---------------------------------------------------------------------------

function parseMessageText(msg: WechatMessage): string {
  if (!msg.item_list?.length) return "";

  const parts: string[] = [];
  for (const item of msg.item_list) {
    if (item.type === 1 && item.text_item?.text) {
      parts.push(item.text_item.text);
    } else if (item.type === 2) {
      parts.push("[图片]");
    } else if (item.type === 3) {
      // Voice: use transcription if available
      if (item.voice_item?.text) {
        parts.push(item.voice_item.text);
      } else {
        parts.push("[语音]");
      }
    } else if (item.type === 4) {
      parts.push(`[文件: ${item.file_item?.file_name || "未知"}]`);
    } else if (item.type === 5) {
      parts.push("[视频]");
    }
  }
  return parts.join("\n").trim();
}

function toMessageType(msg: WechatMessage): MessageType {
  const firstItem = msg.item_list?.[0];
  if (!firstItem) return "text";
  switch (firstItem.type) {
    case 2: return "image";
    case 3: return "voice";
    case 4: return "file";
    case 5: return "video";
    default: return "text";
  }
}

// ---------------------------------------------------------------------------
// Dedup (in-memory, 60s TTL)
// ---------------------------------------------------------------------------

const processedMessages = new Map<string, number>();
const DEDUP_TTL_MS = 60_000;
const DEDUP_MAX = 10_000;

function isDuplicate(key: string): boolean {
  const now = Date.now();
  if (processedMessages.has(key) && now - processedMessages.get(key)! < DEDUP_TTL_MS) {
    return true;
  }
  processedMessages.set(key, now);
  if (processedMessages.size > DEDUP_MAX) {
    for (const [k, ts] of processedMessages) {
      if (now - ts > DEDUP_TTL_MS) processedMessages.delete(k);
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Convert WechatMessage → InboundMessage
// ---------------------------------------------------------------------------

function toInboundMessage(msg: WechatMessage): InboundMessage {
  const senderId = msg.from_user_id || "unknown";
  const text = parseMessageText(msg);
  const sessionKey = `wechat:${senderId}`;

  // Store context_token for reply
  if (msg.context_token) {
    setContextToken(senderId, msg.context_token);
  }

  return {
    sessionKey,
    text,
    messageType: toMessageType(msg),
    chatType: "private", // WeChat bot is always 1:1
    senderId,
    timestamp: msg.create_time_ms ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const wechatPlugin: ChannelPlugin = {
  meta: {
    id: "wechat",
    label: "WeChat",
    description: "微信机器人，通过二维码扫码登录",
  },

  capabilities: {
    dm: true,
  },

  start: async (handler: Handler) => {
    const config = getConfig();
    console.log("[WeChat] Starting (mode=long-poll)");

    let getUpdatesBuf = "";
    let running = true;

    const shutdown = () => {
      console.log("[WeChat] Shutting down...");
      running = false;
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    // Long-poll loop
    while (running) {
      try {
        const resp = await getUpdates({
          baseUrl: config.baseUrl,
          token: config.token,
          getUpdatesBuf,
        });

        // Session expired
        if (resp.errcode === -14) {
          console.error("[WeChat] Session expired. Please re-login via Settings > Channels.");
          // Pause 1 hour before retrying
          await new Promise((r) => setTimeout(r, 3600_000));
          continue;
        }

        if (resp.get_updates_buf) {
          getUpdatesBuf = resp.get_updates_buf;
        }

        if (!resp.msgs?.length) continue;

        for (const msg of resp.msgs) {
          // Skip bot's own messages
          if (msg.message_type === 2) continue;

          // Dedup
          const dedupeKey = `wechat:${msg.message_id ?? msg.client_id ?? Date.now()}`;
          if (isDuplicate(dedupeKey)) continue;

          // Process
          void (async () => {
            try {
              const inbound = toInboundMessage(msg);
              if (!inbound.text.trim()) return;

              // Write user message to transcript + push to web
              if (transcriptAppend) {
                await transcriptAppend(inbound.sessionKey, "user", inbound.text.trim());
              }
              if (notifyWebClients) notifyWebClients(inbound.sessionKey, "user", inbound.text.trim());

              const reply = await handler(inbound);
              if (reply) {
                // Write assistant reply to transcript + push to web
                if (transcriptAppend) {
                  await transcriptAppend(inbound.sessionKey, "assistant", reply);
                }
                if (notifyWebClients) notifyWebClients(inbound.sessionKey, "assistant", reply);

                // Send reply to WeChat (echo context_token)
                const senderId = msg.from_user_id || "";
                await sendMessageWechat({
                  config,
                  to: senderId,
                  text: reply,
                  contextToken: contextTokens.get(senderId),
                });
              }
            } catch (err) {
              console.error("[WeChat] Error handling message:", err);
            }
          })();
        }
      } catch (err) {
        console.error("[WeChat] Long-poll error:", err);
        // Backoff before retry
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  },

  deliver: async (to: string, text: string) => {
    const config = getConfig();
    await sendMessageWechat({
      config,
      to,
      text,
      contextToken: contextTokens.get(to),
    });
  },
};
