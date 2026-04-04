/**
 * Shim for @anthropic-ai/mcpb (unavailable internal package).
 * Only type imports exist in the source — this file is a placeholder
 * so the bundler can resolve the module.
 */

export interface McpbUserConfigurationOption {
  type: string
  description?: string
  required?: boolean
  default?: unknown
  min?: number | null
  max?: number | null
  [key: string]: unknown
}

export type UserConfigSchema = Record<string, McpbUserConfigurationOption>

export interface McpbManifest {
  name: string
  version: string
  description?: string
  author: { name: string; [key: string]: unknown }
  server?: Record<string, unknown>
  user_config?: UserConfigSchema
  [key: string]: unknown
}

export const McpbManifestSchema = {
  safeParse(_data: unknown): {
    success: boolean
    data?: unknown
    error?: {
      flatten: () => {
        fieldErrors: Record<string, string[]>
        formErrors: string[]
      }
    }
  } {
    return {
      success: false,
      error: {
        flatten: () => ({
          fieldErrors: {},
          formErrors: ['mcpb not available'],
        }),
      },
    }
  },
}

export function getMcpConfigForManifest(..._args: unknown[]): unknown {
  return undefined
}

export default undefined
