import type { ToolPermissionContext, Tool as ToolType, ToolUseContext } from '../Tool.js'
import type { AssistantMessage } from '../types/message.js'
import type { PermissionDecision } from '../utils/permissions/PermissionResult.js'
import { hasPermissionsToUseTool } from '../utils/permissions/permissions.js'

export type CanUseToolFn<Input extends Record<string, unknown> = Record<string, unknown>> = (
  tool: ToolType,
  input: Input,
  toolUseContext: ToolUseContext,
  assistantMessage: AssistantMessage,
  toolUseID: string,
  forceDecision?: PermissionDecision<Input>,
) => Promise<PermissionDecision<Input>>

/**
 * Non-React implementation of canUseTool that delegates to hasPermissionsToUseTool.
 * In the original claude-code, this was a React hook wrapping permission logic.
 * For Klaus (non-React), we expose a factory that returns a CanUseToolFn.
 */
export function createCanUseTool(): CanUseToolFn {
  return async (tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision) => {
    if (forceDecision !== undefined) {
      return forceDecision
    }
    const result = await hasPermissionsToUseTool(tool, input, toolUseContext, assistantMessage, toolUseID)
    if (result.behavior === 'allow') {
      return {
        behavior: 'allow' as const,
        updatedInput: result.updatedInput ?? input,
        decisionReason: result.decisionReason,
      }
    }
    // For non-interactive context, deny by default
    return result
  }
}

/**
 * Stub: useCanUseTool is a React hook. Use createCanUseTool() instead.
 */
export default function useCanUseTool(..._args: unknown[]): CanUseToolFn {
  throw new Error('useCanUseTool is a React hook and cannot be used in non-React context. Use createCanUseTool() instead.')
}
