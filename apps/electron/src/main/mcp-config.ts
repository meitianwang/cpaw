import { join, dirname } from 'path'
import { homedir } from 'os'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import type { SettingsStore } from './settings-store.js'

// MCP config file path — same as engine reads
const MCP_CONFIG_PATH = join(homedir(), '.klaus', '.mcp.json')
const MCP_CONFIG_ALT = join(homedir(), '.klaus', 'mcp.json')

interface McpJsonFile {
  mcpServers: Record<string, Record<string, unknown>>
}

export interface McpServerConfig {
  name: string
  config: Record<string, unknown>
  enabled: boolean
}

export class McpConfigManager {
  private store: SettingsStore

  constructor(store: SettingsStore) {
    this.store = store
  }

  /** List all MCP server configs from .mcp.json + enable/disable state */
  list(): McpServerConfig[] {
    const data = this.readMcpJson()
    const prefs = this.getPreferences()

    return Object.entries(data.mcpServers).map(([name, config]) => ({
      name,
      config,
      enabled: prefs.get(name) !== 'off',
    }))
  }

  /** Add a new MCP server */
  create(input: Record<string, unknown>): { ok: boolean; name: string; error?: string } {
    const { name, ...config } = input as { name?: string; [k: string]: unknown }
    if (!name) return { ok: false, name: '', error: 'name is required' }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return { ok: false, name, error: 'Invalid name: only letters, numbers, hyphens, underscores' }
    }

    const data = this.readMcpJson()
    if (data.mcpServers[name]) {
      return { ok: false, name, error: `MCP server "${name}" already exists` }
    }

    data.mcpServers[name] = config
    this.writeMcpJson(data)
    this.store.set(`mcp:${name}`, 'on')
    return { ok: true, name }
  }

  /** Enable/disable an MCP server */
  toggle(name: string, enabled: boolean): void {
    this.store.set(`mcp:${name}`, enabled ? 'on' : 'off')
  }

  /** Remove an MCP server */
  remove(name: string): boolean {
    const data = this.readMcpJson()
    if (!data.mcpServers[name]) return false
    delete data.mcpServers[name]
    this.writeMcpJson(data)
    this.store.set(`mcp:${name}`, '')
    return true
  }

  /** Import from JSON (multiple servers) */
  importJson(raw: string): { ok: boolean; imported: string[]; errors: string[] } {
    // Strip // comments
    const cleaned = raw.replace(/\/\/[^\n]*/g, '').trim()
    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return { ok: false, imported: [], errors: ['Invalid JSON'] }
    }

    const servers = parsed.mcpServers || parsed
    if (typeof servers !== 'object' || Array.isArray(servers)) {
      return { ok: false, imported: [], errors: ['Expected mcpServers object'] }
    }

    const data = this.readMcpJson()
    const imported: string[] = []
    const errors: string[] = []

    for (const [name, config] of Object.entries(servers)) {
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        errors.push(`${name}: invalid name`)
        continue
      }
      if (data.mcpServers[name]) {
        errors.push(`${name}: already exists`)
        continue
      }
      data.mcpServers[name] = config as Record<string, unknown>
      this.store.set(`mcp:${name}`, 'on')
      imported.push(name)
    }

    if (imported.length > 0) {
      this.writeMcpJson(data)
    }

    return { ok: errors.length === 0, imported, errors }
  }

  private readMcpJson(): McpJsonFile {
    for (const path of [MCP_CONFIG_PATH, MCP_CONFIG_ALT]) {
      if (existsSync(path)) {
        try {
          const raw = readFileSync(path, 'utf-8')
          const parsed = JSON.parse(raw)
          return { mcpServers: parsed?.mcpServers ?? {} }
        } catch {
          continue
        }
      }
    }
    return { mcpServers: {} }
  }

  private writeMcpJson(data: McpJsonFile): void {
    mkdirSync(dirname(MCP_CONFIG_PATH), { recursive: true })
    writeFileSync(MCP_CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8')
  }

  private getPreferences(): Map<string, string> {
    const map = new Map<string, string>()
    for (const [k, v] of this.store.getByPrefix('mcp:')) {
      map.set(k.slice('mcp:'.length), v)
    }
    return map
  }
}
