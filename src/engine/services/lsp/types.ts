export type LspServerConfig = {
  command: string
  args?: string[]
  extensionToLanguage: Record<string, string>
  transport?: 'stdio' | 'socket'
  env?: Record<string, string>
  initializationOptions?: unknown
  settings?: unknown
  workspaceFolder?: string
  startupTimeout?: number
  shutdownTimeout?: number
  restartOnCrash?: boolean
  maxRestarts?: number
}

export type ScopedLspServerConfig = LspServerConfig & {
  /** The scoped name including plugin prefix, e.g. "pluginName/serverName" */
  scopedName?: string
  /** The scope/source of this LSP config (e.g. plugin name) */
  scope?: string
  /** Source identifier (e.g. plugin name) */
  source?: string
}

export type LspServerState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'
  | 'crashed'
