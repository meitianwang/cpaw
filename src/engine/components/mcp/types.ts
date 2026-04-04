export interface AgentMcpServerInfo {
  name: string
  sourceAgents: string[]
  transport: string
  command?: string
  url?: string
  needsAuth: boolean
}
