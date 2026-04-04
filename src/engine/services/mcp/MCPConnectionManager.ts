import type { Command } from '../../commands.js'
import type { Tool } from '../../Tool.js'
import type { MCPServerConnection, ScopedMcpServerConfig, ServerResource } from './types.js'
import { useManageMCPConnections } from './useManageMCPConnections.js'

interface MCPConnectionContextValue {
  reconnectMcpServer: (serverName: string) => Promise<{
    client: MCPServerConnection
    tools: Tool[]
    commands: Command[]
    resources?: ServerResource[]
  }>
  toggleMcpServer: (serverName: string) => Promise<void>
}

/**
 * Stub: useMcpReconnect is a React hook.
 */
export function useMcpReconnect(): MCPConnectionContextValue['reconnectMcpServer'] {
  throw new Error('useMcpReconnect is a React hook and cannot be used in non-React context')
}

/**
 * Stub: useMcpToggleEnabled is a React hook.
 */
export function useMcpToggleEnabled(): MCPConnectionContextValue['toggleMcpServer'] {
  throw new Error('useMcpToggleEnabled is a React hook and cannot be used in non-React context')
}

/**
 * Stub: MCPConnectionManager is a React component.
 * In non-React context, MCP connections are managed directly.
 */
export function MCPConnectionManager(_props: {
  children: unknown
  dynamicMcpConfig: Record<string, ScopedMcpServerConfig> | undefined
  isStrictMcpConfig: boolean
}): null {
  return null
}
