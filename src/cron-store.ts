/**
 * Persistent cron job store: atomic JSON file for CLI-added tasks.
 *
 * Stores tasks added via `/cron add` to `~/.klaus/cron/jobs.json`.
 * Config.yaml tasks take precedence for duplicate IDs on load.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  copyFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { CONFIG_DIR } from "./config.js";
import type { CronTask } from "./types.js";

const DEFAULT_STORE_PATH = join(CONFIG_DIR, "cron", "jobs.json");

interface StoreFile {
  readonly version: 1;
  readonly jobs: CronTask[];
}

export class CronJobStore {
  private readonly path: string;
  private jobs: CronTask[] = [];
  private lastJson = "";

  constructor(storePath?: string) {
    this.path = storePath ?? DEFAULT_STORE_PATH;
  }

  /** Load jobs from disk. Returns stored tasks (caller merges with config). */
  load(): readonly CronTask[] {
    if (!existsSync(this.path)) {
      this.jobs = [];
      this.lastJson = "";
      return [];
    }
    try {
      const raw = readFileSync(this.path, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const arr = Array.isArray(parsed.jobs) ? parsed.jobs : [];
      this.jobs = arr.filter(
        (j): j is CronTask =>
          typeof j === "object" && j !== null && typeof (j as Record<string, unknown>).id === "string",
      );
      this.lastJson = raw;
    } catch {
      console.warn("[CronStore] Failed to parse jobs.json, starting fresh");
      this.jobs = [];
      this.lastJson = "";
    }
    return this.jobs;
  }

  /** Save current state to disk (atomic: temp + rename). */
  save(): void {
    const store: StoreFile = { version: 1, jobs: this.jobs };
    const json = JSON.stringify(store, null, 2);
    if (json === this.lastJson) return; // No-op if unchanged

    mkdirSync(dirname(this.path), { recursive: true });

    // Backup existing file
    if (this.lastJson && existsSync(this.path)) {
      try {
        copyFileSync(this.path, `${this.path}.bak`);
      } catch {
        // best-effort
      }
    }

    // Atomic write
    const tmp = `${this.path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    writeFileSync(tmp, json, "utf-8");
    renameSync(tmp, this.path);
    this.lastJson = json;
  }

  /** Add or replace a task, then persist. */
  upsert(task: CronTask): void {
    this.jobs = this.jobs.filter((j) => j.id !== task.id);
    this.jobs.push(task);
    this.save();
  }

  /** Update fields on an existing task, then persist. */
  update(id: string, patch: Partial<CronTask>): boolean {
    const idx = this.jobs.findIndex((j) => j.id === id);
    if (idx === -1) return false;
    this.jobs[idx] = { ...this.jobs[idx], ...patch };
    this.save();
    return true;
  }

  /** Remove a task by ID, then persist. */
  remove(id: string): boolean {
    const before = this.jobs.length;
    this.jobs = this.jobs.filter((j) => j.id !== id);
    if (this.jobs.length === before) return false;
    this.save();
    return true;
  }

  /** Check if a task exists in the store. */
  has(id: string): boolean {
    return this.jobs.some((j) => j.id === id);
  }
}
