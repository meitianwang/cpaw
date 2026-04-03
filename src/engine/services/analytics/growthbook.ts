// @ts-nocheck
/**
 * GrowthBook stub — Klaus doesn't use GrowthBook/Statsig.
 * All feature flags return defaults. All functions are no-ops.
 * Preserves the full export surface so all consumers compile.
 */

export type GrowthBookUserAttributes = {
  id: string
  sessionId: string
  deviceID: string
  platform: 'win32' | 'darwin' | 'linux'
  apiBaseUrlHost?: string
  organizationUUID?: string
  accountUUID?: string
  userType?: string
  subscriptionType?: string
  rateLimitTier?: string
  firstTokenTime?: number
  email?: string
  appVersion?: string
  github?: unknown
}

export function onGrowthBookRefresh(_cb: () => void): () => void { return () => {} }
export function hasGrowthBookEnvOverride(_feature: string): boolean { return false }
export function getAllGrowthBookFeatures(): Record<string, unknown> { return {} }
export function getGrowthBookConfigOverrides(): Record<string, unknown> { return {} }
export function setGrowthBookConfigOverride(_key: string, _value: unknown): void {}
export function clearGrowthBookConfigOverrides(): void {}
export function getApiBaseUrlHost(): string | undefined { return undefined }
export const initializeGrowthBook = async () => {}
export async function getFeatureValue_DEPRECATED<T>(_key: string, defaultValue: T): Promise<T> { return defaultValue }
export function getFeatureValue_CACHED_MAY_BE_STALE<T>(_key: string, defaultValue: T): T { return defaultValue }
export function getFeatureValue_CACHED_WITH_REFRESH<T>(_key: string, defaultValue: T): T { return defaultValue }
export function checkStatsigFeatureGate_CACHED_MAY_BE_STALE(_gate: string): boolean { return false }
export async function checkSecurityRestrictionGate(_gate: string): Promise<boolean> { return false }
export async function checkGate_CACHED_OR_BLOCKING(_gate: string): Promise<boolean> { return false }
export function refreshGrowthBookAfterAuthChange(): void {}
export function resetGrowthBook(): void {}
export async function refreshGrowthBookFeatures(): Promise<void> {}
export function setupPeriodicGrowthBookRefresh(): void {}
export function stopPeriodicGrowthBookRefresh(): void {}
export async function getDynamicConfig_BLOCKS_ON_INIT<T>(_key: string, defaultValue: T): Promise<T> { return defaultValue }
export function getDynamicConfig_CACHED_MAY_BE_STALE<T>(_key: string, defaultValue: T): T { return defaultValue }
