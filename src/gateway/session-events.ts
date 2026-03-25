export type GatewaySessionEventKind =
  | "user_message"
  | "assistant_message"
  | "tool_started"
  | "tool_finished"
  | "attempt_started"
  | "attempt_progress"
  | "attempt_completed"
  | "attempt_failed";

export type GatewaySessionEvent = {
  readonly eventId: string;
  readonly kind: GatewaySessionEventKind;
  readonly sessionKey: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly at: number;
  readonly attemptId?: string;
  readonly title: string;
  readonly detail?: string;
  readonly status: "info" | "success" | "error";
  readonly toolName?: string;
  readonly toolUseId?: string;
};

/**
 * Stateless event factory — generates eventId and returns the event
 * for immediate push to connected clients. No server-side storage.
 */
export function createSessionEvent(
  event: Omit<GatewaySessionEvent, "eventId">,
): GatewaySessionEvent {
  return {
    ...event,
    eventId: `${event.sessionId}-${event.kind}-${event.at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  };
}
