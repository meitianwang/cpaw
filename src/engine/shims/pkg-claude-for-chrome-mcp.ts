/**
 * Shim for @ant/claude-for-chrome-mcp (unavailable internal package).
 */

export interface ClaudeForChromeContext {
  [key: string]: unknown
}

export interface Logger {
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
  debug: (message: string, ...args: unknown[]) => void
  silly?: (message: string, ...args: unknown[]) => void
}

export type PermissionMode = 'auto' | 'manual' | string

export const BROWSER_TOOLS: { name: string }[] = []

export function createClaudeForChromeMcpServer(..._args: unknown[]) {
  return {
    connect: async (..._args: unknown[]) => {},
    setRequestHandler: (..._args: unknown[]) => {},
    close: async () => {},
  }
}

export function getClaudeInChromeMCPToolOverrides(..._args: unknown[]): unknown[] {
  return []
}
