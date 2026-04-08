/**
 * Per-user directory isolation — path resolution and userId extraction.
 *
 * Directory layout:
 *   ~/.klaus/users/{userId}/
 *     ├── .claude/skills/  # per-user installed skills
 *     ├── memory/          # memory markdown files
 *     ├── memory.db        # memory vector index
 *     ├── transcripts/     # JSONL chat transcripts
 *     ├── agent-sessions/  # agent state persistence
 *     ├── uploads/         # uploaded files
 *     └── workspace/       # coding tools workdir
 */

import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR } from "./config.js";

const USERS_BASE = join(CONFIG_DIR, "users");

export function getUserMemoryDir(userId: string): string {
  return join(USERS_BASE, userId, "memory");
}

export function getUserMemoryDbPath(userId: string): string {
  return join(USERS_BASE, userId, "memory.db");
}

export function getUserTranscriptsDir(userId: string): string {
  return join(USERS_BASE, userId, "transcripts");
}

export function getUserSessionsDir(userId: string): string {
  return join(USERS_BASE, userId, "agent-sessions");
}

export function getUserUploadsDir(userId: string): string {
  return join(USERS_BASE, userId, "uploads");
}

export function getUserWorkspaceDir(userId: string): string {
  return join(USERS_BASE, userId, "workspace");
}

export function getUserSkillsDir(userId: string): string {
  return join(USERS_BASE, userId, ".claude", "skills");
}

/** Per-user MCP config file: ~/.klaus/users/{userId}/.mcp.json */
export function getUserMcpConfigPath(userId: string): string {
  return join(USERS_BASE, userId, ".mcp.json");
}

/** Global skills marketplace — bundled with the project, deployed with the code. */
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SKILLS_MARKET_DIR = join(PROJECT_ROOT, "skills-market");

/** Tracks users whose directories have already been created this process. */
const ensuredUsers = new Set<string>();

/** Create all per-user directories if they don't exist. */
export async function ensureUserDirs(userId: string): Promise<void> {
  if (ensuredUsers.has(userId)) return;
  await Promise.all([
    mkdir(getUserMemoryDir(userId), { recursive: true }),
    mkdir(getUserTranscriptsDir(userId), { recursive: true }),
    mkdir(getUserSessionsDir(userId), { recursive: true }),
    mkdir(getUserUploadsDir(userId), { recursive: true }),
    mkdir(getUserWorkspaceDir(userId), { recursive: true }),
    mkdir(getUserSkillsDir(userId), { recursive: true }),
  ]);
  ensuredUsers.add(userId);
}

/**
 * Extract a canonical userId from a session key.
 *
 * Session key formats:
 *   web:{userId}:{sessionId}    → {userId}
 *   feishu:{senderId}           → feishu_{senderId}
 *   dingtalk:{senderId}         → dingtalk_{senderId}
 *   wechat:{senderId}           → wechat_{senderId}
 *   qq:{senderId}               → qq_{senderId}
 *   qq:group:{groupId}          → qq_group_{groupId}
 *   cron:{taskId}               → cron_{taskId}
 */
export function extractUserId(sessionKey: string): string {
  const parts = sessionKey.split(":");
  const channel = parts[0];

  const userId = (channel === "web" && parts.length >= 3) ? parts[1] : parts.join("_");
  return sanitizeUserId(userId);
}

/** Strip path-unsafe characters to prevent directory traversal. */
function sanitizeUserId(raw: string): string {
  // Replace path separators and collapse ".." to prevent traversal
  const safe = raw.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
  if (!safe || safe === "." || safe === "_") {
    return "unknown";
  }
  return safe;
}
