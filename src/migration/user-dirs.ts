/**
 * One-time migration: move legacy global data into per-user directories.
 *
 * Legacy layout:
 *   ~/.klaus/memory/         → ~/.klaus/users/{userId}/memory/
 *   ~/.klaus/memory.db       → ~/.klaus/users/{userId}/memory.db
 *   ~/.klaus/transcripts/    → ~/.klaus/users/{userId}/transcripts/
 *   ~/.klaus/agent-sessions/ → ~/.klaus/users/{userId}/agent-sessions/
 *   ~/.klaus/uploads/{uid}/  → ~/.klaus/users/{uid}/uploads/
 *
 * Runs once at startup if ~/.klaus/users/.migrated does not exist.
 */

import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "../config.js";
import { ensureUserDirs, extractUserId, getUserTranscriptsDir, getUserSessionsDir, getUserUploadsDir, getUserMemoryDir, getUserMemoryDbPath } from "../user-dirs.js";

const USERS_BASE = join(CONFIG_DIR, "users");
const MARKER = join(USERS_BASE, ".migrated");

export async function runMigrationIfNeeded(): Promise<void> {
  if (existsSync(MARKER)) return;
  mkdirSync(USERS_BASE, { recursive: true });

  console.log("[Migration] Starting per-user directory migration...");
  let moved = 0;
  let errors = 0;

  function tryMove(src: string, dest: string): boolean {
    try { renameSync(src, dest); return true; } catch (err) {
      console.warn(`[Migration] Failed to move ${src} → ${dest}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
      return false;
    }
  }

  function tryCopy(src: string, dest: string): boolean {
    try { copyFileSync(src, dest); return true; } catch (err) {
      console.warn(`[Migration] Failed to copy ${src} → ${dest}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
      return false;
    }
  }

  // 1. Migrate transcripts
  const legacyTranscripts = join(CONFIG_DIR, "transcripts");
  if (existsSync(legacyTranscripts)) {
    for (const name of readdirSync(legacyTranscripts)) {
      if (!name.endsWith(".jsonl")) continue;
      const fp = join(legacyTranscripts, name);
      const sessionKey = extractSessionKeyFromFile(fp);
      if (!sessionKey) continue;
      const userId = extractUserId(sessionKey);
      await ensureUserDirs(userId);
      if (tryMove(fp, join(getUserTranscriptsDir(userId), name))) moved++;
    }
  }

  // 2. Migrate agent-sessions
  const legacySessions = join(CONFIG_DIR, "agent-sessions");
  if (existsSync(legacySessions)) {
    for (const name of readdirSync(legacySessions)) {
      const sessionKey = reverseSessionFilename(name);
      if (!sessionKey) continue;
      const userId = extractUserId(sessionKey);
      await ensureUserDirs(userId);
      if (tryMove(join(legacySessions, name), join(getUserSessionsDir(userId), name))) moved++;
    }
  }

  // 3. Migrate uploads
  const legacyUploads = join(CONFIG_DIR, "uploads");
  if (existsSync(legacyUploads)) {
    for (const uid of readdirSync(legacyUploads)) {
      if (uid.startsWith(".") || uid.includes("..") || uid.includes("/")) continue;
      const src = join(legacyUploads, uid);
      await ensureUserDirs(uid);
      const dest = getUserUploadsDir(uid);
      try {
        for (const file of readdirSync(src)) {
          if (tryMove(join(src, file), join(dest, file))) moved++;
        }
      } catch (err) {
        console.warn(`[Migration] Failed to read uploads for ${uid}: ${err instanceof Error ? err.message : String(err)}`);
        errors++;
      }
    }
  }

  // 4. Migrate memory — assign to first admin user
  const legacyMemoryDir = join(CONFIG_DIR, "memory");
  const legacyMemoryDb = join(CONFIG_DIR, "memory.db");
  if (existsSync(legacyMemoryDir) || existsSync(legacyMemoryDb)) {
    const targetUserId = findPrimaryUser();
    if (targetUserId) {
      await ensureUserDirs(targetUserId);
      if (existsSync(legacyMemoryDb)) {
        if (tryCopy(legacyMemoryDb, getUserMemoryDbPath(targetUserId))) moved++;
      }
      if (existsSync(legacyMemoryDir)) {
        const destDir = getUserMemoryDir(targetUserId);
        try {
          for (const file of readdirSync(legacyMemoryDir)) {
            const dest = join(destDir, file);
            if (!existsSync(dest)) {
              if (tryCopy(join(legacyMemoryDir, file), dest)) moved++;
            }
          }
        } catch (err) {
          console.warn(`[Migration] Failed to read memory dir: ${err instanceof Error ? err.message : String(err)}`);
          errors++;
        }
      }
    }
  }

  writeFileSync(MARKER, `Migrated at ${new Date().toISOString()}, moved=${moved}, errors=${errors}\n`, "utf-8");
  if (errors > 0) {
    console.warn(`[Migration] Done with ${errors} error(s). Moved ${moved} file(s). Check logs above.`);
  } else {
    console.log(`[Migration] Done. Moved ${moved} file(s) to per-user directories.`);
  }
}

/** Read the first line of a JSONL transcript to extract sessionKey. */
function extractSessionKeyFromFile(fp: string): string | null {
  try {
    const raw = readFileSync(fp, "utf-8");
    const firstLine = raw.split("\n")[0];
    if (!firstLine) return null;
    const parsed = JSON.parse(firstLine);
    return typeof parsed.sessionKey === "string" ? parsed.sessionKey : null;
  } catch {
    return null;
  }
}

/**
 * Reverse the sanitizeSessionKey transformation on a filename.
 * sanitizeSessionKey replaces non-alphanumeric (except . - _) with _,
 * but the original sessionKey used : as separator.
 * Best-effort: "web_userId_sessionId" → "web:userId:sessionId"
 */
function reverseSessionFilename(name: string): string | null {
  // Remove file extension
  const base = name.replace(/\.\w+$/, "");
  if (!base) return null;
  // Heuristic: replace first _ with : for channel prefix, and second _ for web channel
  if (base.startsWith("web_")) {
    // web_userId_sessionId → try to find the boundary
    const rest = base.slice(4);
    const underscoreIdx = rest.indexOf("_");
    if (underscoreIdx > 0) {
      return `web:${rest.slice(0, underscoreIdx)}:${rest.slice(underscoreIdx + 1)}`;
    }
  }
  // Non-web: feishu_senderId → feishu:senderId
  const firstUnderscore = base.indexOf("_");
  if (firstUnderscore > 0) {
    return `${base.slice(0, firstUnderscore)}:${base.slice(firstUnderscore + 1)}`;
  }
  return base;
}

/** Find the primary user (first admin, or first user) from users.db. */
function findPrimaryUser(): string | null {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(join(CONFIG_DIR, "users.db"), { readonly: true });
    const row = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
    if (row) { db.close(); return row.id; }
    const anyRow = db.prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
    db.close();
    return anyRow?.id ?? null;
  } catch {
    return null;
  }
}
