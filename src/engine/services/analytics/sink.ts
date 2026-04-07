/**
 * Analytics sink implementation
 *
 * This module contains the actual analytics routing logic and should be
 * initialized during app startup. It routes events to Datadog and 1P event
 * logging.
 *
 * Usage: Call initializeAnalyticsSink() during app startup to attach the sink.
 */

import { trackDatadogEvent } from './datadog.js'
import { logEventTo1P, shouldSampleEvent } from './firstPartyEventLogger.js'
import { checkStatsigFeatureGate_CACHED_MAY_BE_STALE } from './growthbook.js'
import { attachAnalyticsSink, stripProtoFields } from './index.js'
import { isSinkKilled } from './sinkKillswitch.js'

// Local type matching the logEvent metadata signature
type LogEventMetadata = { [key: string]: boolean | number | undefined }

const DATADOG_GATE_NAME = 'tengu_log_datadog_events'

// Module-level gate state - starts undefined, initialized during startup
let isDatadogGateEnabled: boolean | undefined = undefined

/**
 * Check if Datadog tracking is enabled.
 * Falls back to cached value from previous session if not yet initialized.
 */
function shouldTrackDatadog(): boolean {
  if (isSinkKilled('datadog')) {
    return false
  }
  if (isDatadogGateEnabled !== undefined) {
    return isDatadogGateEnabled
  }

  // Fallback to cached value from previous session
  try {
    return checkStatsigFeatureGate_CACHED_MAY_BE_STALE(DATADOG_GATE_NAME)
  } catch {
    return false
  }
}

/**
 * Log an event (synchronous implementation)
 */
function logEventImpl(eventName: string, metadata: LogEventMetadata): void {
  // Check if this event should be sampled
  const sampleResult = shouldSampleEvent(eventName)

  // If sample result is 0, the event was not selected for logging
  if (sampleResult === 0) {
    return
  }

  // If sample result is a positive number, add it to metadata
  const metadataWithSampleRate =
    sampleResult !== null
      ? { ...metadata, sample_rate: sampleResult }
      : metadata

  if (shouldTrackDatadog()) {
    // Datadog is a general-access backend — strip _PROTO_* keys
    // (unredacted PII-tagged values meant only for the 1P privileged column).
    void trackDatadogEvent(eventName, stripProtoFields(metadataWithSampleRate))
  }

  // 1P receives the full payload including _PROTO_* — the exporter
  // destructures and routes those keys to proto fields itself.
  logEventTo1P(eventName, metadataWithSampleRate)
}

/**
 * Log an event (asynchronous implementation)
 *
 * With Segment removed the two remaining sinks are fire-and-forget, so this
 * just wraps the sync impl — kept to preserve the sink interface contract.
 */
function logEventAsyncImpl(
  eventName: string,
  metadata: LogEventMetadata,
): Promise<void> {
  logEventImpl(eventName, metadata)
  return Promise.resolve()
}

/**
 * Initialize analytics gates during startup.
 *
 * Updates gate values from server. Early events use cached values from previous
 * session to avoid data loss during initialization.
 *
 * Called from main.tsx during setupBackend().
 */
export function initializeAnalyticsGates(): void {
  isDatadogGateEnabled =
    checkStatsigFeatureGate_CACHED_MAY_BE_STALE(DATADOG_GATE_NAME)
}

/**
 * Initialize the analytics sink.
 *
 * Call this during app startup to attach the analytics backend.
 * Any events logged before this is called will be queued and drained.
 *
 * Idempotent: safe to call multiple times (subsequent calls are no-ops).
 */
export function initializeAnalyticsSink(): void {
  attachAnalyticsSink({
    logEvent: logEventImpl,
    logEventAsync: logEventAsyncImpl,
  })
}

// ============================================================================
// Klaus-specific: SQLite analytics sink for local event storage
// ============================================================================

import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'crypto'

export class SQLiteAnalyticsSink {
  private db: Database
  private insertStmt: ReturnType<Database["prepare"]>

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        event_name TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_events_name ON events(event_name);
      CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
    `)

    this.insertStmt = this.db.prepare(
      'INSERT INTO events (id, event_name, metadata, created_at) VALUES (?, ?, ?, ?)',
    )
  }

  logEvent(eventName: string, metadata: Record<string, unknown>) {
    try {
      this.insertStmt.run(
        randomUUID(),
        eventName,
        JSON.stringify(metadata),
        new Date().toISOString(),
      )
    } catch {
      // Swallow write errors — analytics must never crash the host
    }
  }

  async logEventAsync(eventName: string, metadata: Record<string, unknown>) {
    this.logEvent(eventName, metadata)
  }

  queryEvents(opts: { eventName?: string; since?: string; limit?: number; offset?: number }) {
    const conditions = []
    const params = []

    if (opts?.eventName) {
      conditions.push('event_name = ?')
      params.push(opts.eventName)
    }
    if (opts?.since) {
      conditions.push('created_at >= ?')
      params.push(opts.since)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = opts?.limit ?? 100
    const offset = opts?.offset ?? 0

    const total = (this.db.prepare(`SELECT COUNT(*) as count FROM events ${where}`).get(...params) as any).count

    const events = this.db
      .prepare(
        `SELECT id, event_name, metadata, created_at FROM events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset)

    return { events, total }
  }

  getEventCounts(since?: string) {
    const where = since ? 'WHERE created_at >= ?' : ''
    const params = since ? [since] : []
    return this.db
      .prepare(
        `SELECT event_name, COUNT(*) as count FROM events ${where} GROUP BY event_name ORDER BY count DESC`,
      )
      .all(...params)
  }

  getUsageSummary(since?: string) {
    const where = since ? "WHERE event_name = 'tengu_api_success' AND created_at >= ?" : "WHERE event_name = 'tengu_api_success'"
    const params = since ? [since] : []
    const rows = this.db
      .prepare(`SELECT metadata FROM events ${where}`)
      .all(...params)

    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCacheReadTokens = 0
    let totalCacheCreationTokens = 0
    let totalCostUSD = 0
    let apiCallCount = 0

    for (const row of rows) {
      try {
        const meta = JSON.parse((row as any).metadata)
        totalInputTokens += meta.input_tokens ?? 0
        totalOutputTokens += meta.output_tokens ?? 0
        totalCacheReadTokens += meta.cache_read_input_tokens ?? 0
        totalCacheCreationTokens += meta.cache_creation_input_tokens ?? 0
        totalCostUSD += meta.cost_usd ?? 0
        apiCallCount++
      } catch {
        // skip malformed
      }
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens,
      totalCostUSD,
      apiCallCount,
    }
  }

  close() {
    this.db.close()
  }
}
