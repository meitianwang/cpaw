/**
 * Per-user MemoryManager pool — lazily creates and caches MemoryManager instances.
 * Each user gets their own memory.db, memory/ directory, and transcripts/ directory.
 */

import { MemoryManager } from "./manager.js";
import type { MemoryConfig } from "./types.js";
import { getUserMemoryDir, getUserMemoryDbPath, getUserTranscriptsDir } from "../user-dirs.js";

const DEFAULT_MAX_POOL_SIZE = 50;

export class MemoryManagerPool {
  private readonly managers = new Map<string, MemoryManager>();
  private readonly pending = new Map<string, Promise<MemoryManager>>();
  private readonly config: MemoryConfig;
  private readonly maxSize: number;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor(config: MemoryConfig, maxSize?: number) {
    this.config = config;
    this.maxSize = maxSize ?? DEFAULT_MAX_POOL_SIZE;
  }

  /** Get or create a MemoryManager for the given userId. */
  async getOrCreate(userId: string): Promise<MemoryManager> {
    const existing = this.managers.get(userId);
    if (existing) {
      // LRU: move to end
      this.managers.delete(userId);
      this.managers.set(userId, existing);
      return existing;
    }

    // Deduplicate concurrent creation for the same userId
    let inflight = this.pending.get(userId);
    if (inflight) return inflight;

    inflight = this.createManager(userId);
    this.pending.set(userId, inflight);
    try {
      return await inflight;
    } finally {
      this.pending.delete(userId);
    }
  }

  private async createManager(userId: string): Promise<MemoryManager> {
    this.evictIfNeeded();

    const manager = new MemoryManager({
      dbPath: getUserMemoryDbPath(userId),
      config: this.config,
      memoryDir: getUserMemoryDir(userId),
      transcriptsDir: this.config.sources.includes("sessions")
        ? getUserTranscriptsDir(userId)
        : undefined,
    });

    await manager.initProvider();
    await manager.sync().catch((err: unknown) => {
      console.warn(`[MemoryPool] Initial sync failed for user ${userId}: ${String(err)}`);
    });
    manager.startWatcher();
    manager.startSessionListener();

    this.managers.set(userId, manager);
    return manager;
  }

  /** Start periodic sync for all active managers. */
  startPeriodicSync(): void {
    if (this.intervalTimer || this.config.sync.intervalMinutes <= 0) return;
    const intervalMs = this.config.sync.intervalMinutes * 60_000;
    this.intervalTimer = setInterval(() => {
      for (const [userId, mgr] of this.managers) {
        mgr.sync().catch((err: unknown) => {
          console.warn(`[MemoryPool] Periodic sync failed for ${userId}: ${String(err)}`);
        });
      }
    }, intervalMs);
    this.intervalTimer.unref();
  }

  get citationsMode() {
    return this.config.citations;
  }

  /** Close all managers and release resources. */
  async closeAll(): Promise<void> {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    const entries = [...this.managers.values()];
    this.managers.clear();
    await Promise.allSettled(entries.map((m) => m.close()));
  }

  /** Sync all active managers. */
  async syncAll(): Promise<void> {
    await Promise.allSettled(
      [...this.managers.values()].map((m) => m.sync()),
    );
  }

  private evictIfNeeded(): void {
    if (this.managers.size < this.maxSize) return;
    const [oldestKey, oldest] = this.managers.entries().next().value!;
    this.managers.delete(oldestKey);
    oldest.close().catch((err) => {
      console.warn(`[MemoryPool] Close failed for evicted user ${oldestKey}: ${String(err)}`);
    });
  }
}
