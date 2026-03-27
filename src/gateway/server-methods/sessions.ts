import type { MessageStore } from "../../message-store.js";
import { buildWebSessionKey } from "../protocol.js";

export async function readGatewayHistory(params: {
  messageStore: MessageStore;
  userId: string;
  sessionId: string;
  limit: number;
}): Promise<{ messages: readonly unknown[]; total: number }> {
  // Feishu sessions use their own key format (feishu:xxx), not web:{userId}:{sessionId}
  const sessionKey = params.sessionId.startsWith("feishu:")
    ? params.sessionId
    : buildWebSessionKey(params.userId, params.sessionId);
  const all = await params.messageStore.readHistory(sessionKey);
  const messages = all.length > params.limit ? all.slice(-params.limit) : all;
  return { messages, total: all.length };
}

export async function listGatewaySessions(params: {
  messageStore: MessageStore;
  userId: string;
  /** If true, include feishu channel sessions (only the feishu owner should see them). */
  includeFeishu?: boolean;
}): Promise<{ sessions: readonly unknown[] }> {
  const webPrefix = buildWebSessionKey(params.userId, "");
  const webSessions = await params.messageStore.listSessions(webPrefix);

  // Feishu sessions use "feishu:" prefix — only shown to the user who configured the channel
  let feishuSessions: unknown[] = [];
  if (params.includeFeishu) {
    const raw = await params.messageStore.listSessions("feishu:");
    feishuSessions = raw.map((s) => ({
      ...s,
      sessionId: `feishu:${(s as { sessionId: string }).sessionId}`,
    }));
  }

  return { sessions: [...webSessions, ...feishuSessions] };
}

export function deleteGatewaySession(params: {
  messageStore: MessageStore;
  userId: string;
  sessionId: string;
}): boolean {
  const key = params.sessionId.startsWith("feishu:")
    ? params.sessionId
    : buildWebSessionKey(params.userId, params.sessionId);
  return params.messageStore.deleteSession(key);
}
