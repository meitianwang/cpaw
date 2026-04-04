// Stub: teleport — not used in Klaus server mode

export async function teleportToRemote(
  ..._args: unknown[]
): Promise<{ id: string; title?: string; [key: string]: unknown } | null> {
  return null
}
export async function teleportToRemoteWithErrorHandling() { return null }
export async function validateGitState() {}
export function processMessagesForTeleportResume(messages: any[]) { return messages }
export async function checkOutTeleportedSessionBranch() { return {} }
export async function validateSessionRepository() { return { valid: true } }
export async function teleportResumeCodeSession() { return {} }
export async function archiveRemoteSession(..._args: any[]) {}
export type PollRemoteSessionResponse = {
  lastEventId: string
  newEvents: unknown[]
  sessionStatus: string
}

export async function pollRemoteSessionEvents(
  _sessionId?: string,
  _lastEventId?: string,
): Promise<{
  lastEventId: string
  newEvents: unknown[]
  sessionStatus: string
}> {
  return { lastEventId: '', newEvents: [], sessionStatus: 'unknown' }
}
