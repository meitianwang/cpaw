/**
 * Shim for @ant/computer-use-mcp and its subpath imports:
 *   @ant/computer-use-mcp
 *   @ant/computer-use-mcp/types
 *   @ant/computer-use-mcp/sentinelApps
 */

// --- types ---
export interface ComputerExecutor {
  [key: string]: unknown
}
export type DisplayGeometry = [number, number]
export interface FrontmostApp {
  name?: string
  bundleId?: string
  displayName?: string
  [key: string]: unknown
}
export interface InstalledApp {
  name: string
  bundleId?: string
  [key: string]: unknown
}
export interface ResolvePrepareCaptureResult {
  [key: string]: unknown
}
export interface RunningApp {
  name: string
  bundleId?: string
  pid?: number
  [key: string]: unknown
}
export interface ScreenshotResult {
  data: Buffer | Uint8Array
  width: number
  height: number
  [key: string]: unknown
}
export type CoordinateMode = 'absolute' | 'relative' | string
export interface CuSubGates {
  [key: string]: boolean | undefined
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHostFn = (...args: any[]) => any

export interface ComputerUseHostAdapter {
  executor: {
    capabilities: Record<string, boolean>
    listInstalledApps: AnyHostFn
    [key: string]: unknown
  }
  isDisabled: () => boolean
  [key: string]: unknown
}
export interface Logger {
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
  debug: (message: string, ...args: unknown[]) => void
  silly?: (message: string, ...args: unknown[]) => void
}

// --- base package ---
export function bindSessionContext() {
  return {}
}
export const DEFAULT_GRANT_FLAGS = {}
export function buildComputerUseTools(..._args: any[]): { name: string }[] {
  return []
}
export function createComputerUseMcpServer(..._args: unknown[]) {
  return {
    connect: async (..._args: unknown[]) => {},
    setRequestHandler: (..._args: unknown[]) => {},
    close: async () => {},
  }
}

export function getComputerUseMCPToolOverrides(..._args: unknown[]): unknown[] {
  return []
}
export const API_RESIZE_PARAMS = {}
export function targetImageSize(..._args: any[]) {
  return { width: 0, height: 0 }
}

// --- /sentinelApps ---
export function getSentinelCategory() {
  return undefined
}
