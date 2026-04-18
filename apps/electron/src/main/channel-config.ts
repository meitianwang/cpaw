import type { SettingsStore } from './settings-store.js'

/**
 * Channel configuration manager for the Electron app.
 *
 * Stores channel credentials in settings.db.
 * Actual channel runtime (connecting to Feishu/DingTalk/WeChat etc.)
 * requires importing the channel plugins from the Klaus main codebase.
 *
 * This module handles:
 * - Saving/loading channel credentials
 * - Enable/disable state
 * - Channel status queries
 */

export interface ChannelConfig {
  id: string
  name: string
  enabled: boolean
  connected: boolean
  credentials: Record<string, string>
}

const CHANNEL_DEFS = [
  { id: 'feishu', name: 'Feishu', fields: ['app_id', 'app_secret'] },
  { id: 'dingtalk', name: 'DingTalk', fields: ['client_id', 'client_secret'] },
  { id: 'wechat', name: 'WeChat', fields: [] },
  { id: 'wecom', name: 'WeCom', fields: ['bot_id', 'secret'] },
  { id: 'qq', name: 'QQ', fields: ['app_id', 'client_secret'] },
  { id: 'telegram', name: 'Telegram', fields: ['bot_token'] },
  { id: 'whatsapp', name: 'WhatsApp', fields: [] },
]

export class ChannelConfigManager {
  private store: SettingsStore

  constructor(store: SettingsStore) {
    this.store = store
  }

  /** List all channels with their config status */
  list(): ChannelConfig[] {
    return CHANNEL_DEFS.map(ch => {
      const credentials: Record<string, string> = {}
      for (const field of ch.fields) {
        const val = this.store.get(`channel.${ch.id}.${field}`)
        if (val) credentials[field] = val
      }
      const enabled = this.store.getBool(`channel.${ch.id}.enabled`, false)
      const hasCredentials = ch.fields.length === 0 || ch.fields.every(f => !!credentials[f])

      return {
        id: ch.id,
        name: ch.name,
        enabled,
        connected: enabled && hasCredentials,
        credentials,
      }
    })
  }

  /** Save channel credentials and enable it */
  connect(id: string, config: Record<string, string>): { ok: boolean; error?: string } {
    const def = CHANNEL_DEFS.find(c => c.id === id)
    if (!def) return { ok: false, error: `Unknown channel: ${id}` }

    // Validate required fields
    for (const field of def.fields) {
      if (!config[field]?.trim()) {
        return { ok: false, error: `Missing required field: ${field}` }
      }
    }

    // Save credentials
    for (const [key, value] of Object.entries(config)) {
      this.store.set(`channel.${id}.${key}`, value)
    }
    this.store.set(`channel.${id}.enabled`, '1')

    return { ok: true }
  }

  /** Disconnect a channel (disable + clear credentials) */
  disconnect(id: string): boolean {
    const def = CHANNEL_DEFS.find(c => c.id === id)
    if (!def) return false

    this.store.set(`channel.${id}.enabled`, '0')
    for (const field of def.fields) {
      this.store.set(`channel.${id}.${field}`, '')
    }
    return true
  }
}
