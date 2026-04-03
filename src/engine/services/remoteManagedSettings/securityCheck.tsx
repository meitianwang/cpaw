// Stub: remote managed settings security check (not used in Klaus)

export type SecurityCheckResult = {
  allowed: boolean
  reason?: string
}

export async function checkManagedSettingsSecurity(
  _settings: unknown,
  _options?: unknown,
): Promise<SecurityCheckResult> {
  return { allowed: true }
}

export function handleSecurityCheckResult(result: SecurityCheckResult): boolean {
  return result.allowed
}
