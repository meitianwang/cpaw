/**
 * SkillRegistry — singleton that manages skill discovery, caching, and hot reload.
 *
 * Wraps the skill loader with:
 * - Version-counter cache (invalidated on filesystem changes)
 * - Chokidar file watcher for hot reload
 * - Plugin directory registration for channel plugins
 */

import chokidar, { type FSWatcher } from "chokidar";
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  loadResolvedSkills,
  clearBinCache,
  resolveBundledSkillsDir,
  USER_SKILLS_DIR,
  type ResolvedSkill,
  type ApiKeyLookup,
} from "./index.js";
const WATCH_DEBOUNCE_MS = 500;

// Dirs to ignore in watcher
const IGNORED_DIRS = /(?:^|[\\/])(?:\.git|node_modules|dist|\.venv|__pycache__)(?:[\\/]|$)/;

class SkillRegistry {
  private version = 0;
  private cache: ResolvedSkill[] | null = null;
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pluginDirs = new Map<string, string>();
  private apiKeyLookup: ApiKeyLookup | undefined;

  /** Current version — bumped on every invalidation. */
  getVersion(): number {
    return this.version;
  }

  /** Set the API key lookup callback (from SettingsStore). */
  setApiKeyLookup(lookup: ApiKeyLookup): void {
    this.apiKeyLookup = lookup;
  }

  /** Get the current API key lookup callback. */
  getApiKeyLookup(): ApiKeyLookup | undefined {
    return this.apiKeyLookup;
  }

  /** Get cached skills, rebuilding if dirty. */
  getSkills(): ResolvedSkill[] {
    if (!this.cache) {
      this.cache = loadResolvedSkills(this.getPluginDirList(), this.apiKeyLookup);
    }
    return this.cache;
  }

  /** Invalidate cache and bump version. Next getSkills() rebuilds. */
  invalidate(): void {
    this.cache = null;
    this.version++;
  }

  /** Clear the binary detection cache (call after installing deps). */
  resetBinCache(): void {
    clearBinCache();
    this.invalidate();
  }

  // -------------------------------------------------------------------------
  // Plugin directories
  // -------------------------------------------------------------------------

  registerPluginDir(channelId: string, dir: string): void {
    if (!existsSync(dir)) return;
    this.pluginDirs.set(channelId, dir);
    this.watcher?.add(join(dir, "**", "SKILL.md"));
    this.invalidate();
  }

  unregisterPluginDir(channelId: string): void {
    const dir = this.pluginDirs.get(channelId);
    if (!dir) return;
    this.pluginDirs.delete(channelId);
    this.watcher?.unwatch(join(dir, "**", "SKILL.md"));
    this.invalidate();
  }

  getPluginDirList(): string[] {
    return [...this.pluginDirs.values()];
  }

  // -------------------------------------------------------------------------
  // File watcher
  // -------------------------------------------------------------------------

  startWatching(): void {
    if (this.watcher) return;

    const watchPaths = [
      join(resolveBundledSkillsDir(), "**", "SKILL.md"),
      join(USER_SKILLS_DIR, "**", "SKILL.md"),
      ...this.getPluginDirList().map((d) => join(d, "**", "SKILL.md")),
    ];

    this.watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      ignored: IGNORED_DIRS,
      awaitWriteFinish: {
        stabilityThreshold: WATCH_DEBOUNCE_MS,
        pollInterval: 100,
      },
    });

    const onChange = () => this.scheduleInvalidate();
    this.watcher.on("add", onChange);
    this.watcher.on("change", onChange);
    this.watcher.on("unlink", onChange);
  }

  stopWatching(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close().catch(() => {});
      this.watcher = null;
    }
  }

  private scheduleInvalidate(): void {
    if (this.debounceTimer) return; // already scheduled
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.invalidate();
      console.log("[Skills] File change detected, cache invalidated");
    }, WATCH_DEBOUNCE_MS);
    this.debounceTimer.unref();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: SkillRegistry | null = null;

export function getSkillRegistry(): SkillRegistry {
  if (!instance) {
    instance = new SkillRegistry();
  }
  return instance;
}
