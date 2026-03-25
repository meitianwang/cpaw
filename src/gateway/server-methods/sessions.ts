import type { MessageStore } from "../../message-store.js";
import { buildWebSessionKey } from "../protocol.js";

export async function readGatewayHistory(params: {
  messageStore: MessageStore;
  userId: string;
  sessionId: string;
  limit: number;
}): Promise<{ messages: readonly unknown[]; total: number }> {
  const sessionKey = buildWebSessionKey(params.userId, params.sessionId);
  const all = await params.messageStore.readHistory(sessionKey);
  const messages = all.length > params.limit ? all.slice(-params.limit) : all;
  return { messages, total: all.length };
}

export async function listGatewaySessions(params: {
  messageStore: MessageStore;
  userId: string;
  includeAdminFlag?: boolean;
}): Promise<{ sessions: readonly unknown[]; isAdmin: boolean }> {
  const prefix = buildWebSessionKey(params.userId, "");
  const sessions = await params.messageStore.listSessions(prefix);
  return { sessions, isAdmin: Boolean(params.includeAdminFlag) };
}

export function deleteGatewaySession(params: {
  messageStore: MessageStore;
  userId: string;
  sessionId: string;
}): boolean {
  return params.messageStore.deleteSession(
    buildWebSessionKey(params.userId, params.sessionId),
  );
}
