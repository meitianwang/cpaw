/**
 * Skill loader — aligned with OpenClaw's skill system.
 *
 * Loading flow:
 * 1. Discover SKILL.md files from bundled + user dirs (~/.klaus/skills/)
 * 2. Parse YAML frontmatter for metadata (name, description, gating)
 * 3. Filter by eligibility (binary presence, OS, env vars, config)
 * 4. createSkillTool() builds an invoke_skill AgentTool for the agent
 *
 * Sources (precedence high → low):
 *   ~/.klaus/skills/<name>/SKILL.md  (user overrides)
 *   <package>/skills/<name>/SKILL.md (bundled)
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "klaus-agent";
import { loadConfig, CONFIG_DIR } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KlausSkillMetadata {
  readonly emoji?: string;
  readonly os?: readonly string[];
  readonly always?: boolean;
  readonly primaryEnv?: string;
  readonly requires?: {
    readonly bins?: readonly string[];
    readonly anyBins?: readonly string[];
    readonly env?: readonly string[];
  };
  readonly install?: readonly {
    readonly id: string;
    readonly kind: string;
    readonly formula?: string;
    readonly package?: string;
    readonly label: string;
  }[];
}

interface SkillEntry {
  readonly name: string;
  readonly description: string;
  readonly filePath: string;
  readonly source: "bundled" | "user" | "plugin";
  readonly metadata?: KlausSkillMetadata;
  readonly rawContent: string;
}

interface SkillConfig {
  readonly enabled?: boolean;
  readonly env?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

interface ParsedFrontmatter {
  name: string;
  description: string;
  metadata?: KlausSkillMetadata;
}

function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fm = match[1];
  // Simple YAML-like parsing for single-line values
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);
  const metaMatch = fm.match(/^metadata:\s*(.+)$/m);

  if (!nameMatch) return null;

  const name = nameMatch[1].trim().replace(/^["']|["']$/g, "");
  const description = descMatch
    ? descMatch[1].trim().replace(/^["']|["']$/g, "")
    : "";

  let metadata: KlausSkillMetadata | undefined;
  if (metaMatch) {
    try {
      const raw = JSON.parse(metaMatch[1].trim());
      metadata = raw?.klaus ?? raw?.openclaw;
    } catch {
      // Ignore parse errors
    }
  }

  return { name, description, metadata };
}

// ---------------------------------------------------------------------------
// Binary detection
// ---------------------------------------------------------------------------

const binCache = new Map<string, boolean>();

/** Clear the binary detection cache (call after installing deps). */
export function clearBinCache(): void {
  binCache.clear();
}

export function hasBinary(name: string): boolean {
  // Reject names with shell metacharacters to prevent command injection
  if (!/^[a-zA-Z0-9_.\-]+$/.test(name)) return false;

  const cached = binCache.get(name);
  if (cached !== undefined) return cached;

  try {
    const cmd = platform() === "win32" ? `where ${name}` : `which ${name}`;
    execSync(cmd, { stdio: "ignore" });
    binCache.set(name, true);
    return true;
  } catch {
    binCache.set(name, false);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Gating (eligibility check)
// ---------------------------------------------------------------------------

function isEligible(entry: SkillEntry, skillConfig?: SkillConfig): boolean {
  const meta = entry.metadata;

  // Explicitly disabled in config
  if (skillConfig?.enabled === false) return false;

  // Always-on skills
  if (meta?.always) return true;

  // OS check
  if (meta?.os && meta.os.length > 0) {
    if (!meta.os.includes(platform())) return false;
  }

  // Binary requirements
  if (meta?.requires?.bins) {
    for (const bin of meta.requires.bins) {
      if (!hasBinary(bin)) return false;
    }
  }

  // Any-binary requirements
  if (meta?.requires?.anyBins) {
    const hasAny = meta.requires.anyBins.some((bin) => hasBinary(bin));
    if (!hasAny) return false;
  }

  // Environment variable requirements
  if (meta?.requires?.env) {
    for (const envName of meta.requires.env) {
      if (!process.env[envName] && !skillConfig?.env?.[envName]) return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Skill loading from directories
// ---------------------------------------------------------------------------

function loadSkillsFromDir(
  dir: string,
  source: "bundled" | "user" | "plugin",
): SkillEntry[] {
  if (!existsSync(dir)) return [];

  const entries: SkillEntry[] = [];
  let dirEntries: string[];
  try {
    dirEntries = readdirSync(dir);
  } catch {
    return [];
  }

  for (const name of dirEntries) {
    const skillFile = join(dir, name, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    try {
      const content = readFileSync(skillFile, "utf-8");
      const fm = parseFrontmatter(content);
      if (!fm) {
        console.warn(`[Skills] Invalid frontmatter in ${skillFile}`);
        continue;
      }

      entries.push({
        name: fm.name,
        description: fm.description,
        filePath: skillFile,
        source,
        metadata: fm.metadata,
        rawContent: content,
      });
    } catch (err) {
      console.warn(`[Skills] Failed to read ${skillFile}:`, err);
    }
  }

  return entries;
}

export function resolveBundledSkillsDir(): string {
  // Resolve relative to this file's location
  // In dev: src/skills/index.ts → ../../skills/
  // In dist: dist/index.js → ../skills/
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  // Try common locations
  const candidates = [
    resolve(thisDir, "../../skills"), // dev: src/skills/ → skills/
    resolve(thisDir, "../skills"), // dist: dist/ → skills/
  ];

  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }

  return candidates[0]; // fallback
}

export const USER_SKILLS_DIR = join(CONFIG_DIR, "skills");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load all skill entries from bundled + plugin + user dirs, with higher precedence overriding. */
export function loadAllSkillEntries(pluginDirs: string[] = []): SkillEntry[] {
  const bundledDir = resolveBundledSkillsDir();
  const bundled = loadSkillsFromDir(bundledDir, "bundled");
  const plugin = pluginDirs.flatMap((dir) => loadSkillsFromDir(dir, "plugin"));
  const user = loadSkillsFromDir(USER_SKILLS_DIR, "user");

  // Precedence: user > plugin > bundled (later overrides earlier by name)
  const byName = new Map<string, SkillEntry>();
  for (const entry of bundled) byName.set(entry.name, entry);
  for (const entry of plugin) byName.set(entry.name, entry);
  for (const entry of user) byName.set(entry.name, entry);

  return Array.from(byName.values());
}

/** Resolve per-skill config from config.yaml. */
function resolveSkillConfig(skillName: string): SkillConfig | undefined {
  const cfg = loadConfig();
  const entries = (cfg.skills as Record<string, unknown>)?.entries as
    | Record<string, SkillConfig>
    | undefined;
  return entries?.[skillName];
}

/** Optional callback to look up stored API keys (from SettingsStore). */
export type ApiKeyLookup = (skillName: string) => string | undefined;

/**
 * Resolve skill config, enriching env with stored API key if primaryEnv is set.
 * This allows `isEligible` to treat stored API keys as satisfying env requirements.
 */
function resolveFullSkillConfig(
  entry: SkillEntry,
  apiKeyLookup?: ApiKeyLookup,
): SkillConfig | undefined {
  const base = resolveSkillConfig(entry.name);
  const primaryEnv = entry.metadata?.primaryEnv;
  if (!primaryEnv || !apiKeyLookup) return base;

  const storedKey = apiKeyLookup(entry.name);
  if (!storedKey) return base;

  // Inject stored API key into env map so isEligible treats it as satisfied
  const env = { ...base?.env, [primaryEnv]: storedKey };
  return { ...base, env };
}

/** Load enabled (eligible) skills after gating. Pass preloaded entries to avoid re-scanning. */
export function loadEnabledSkills(
  pluginDirs: string[] = [],
  preloaded?: readonly SkillEntry[],
  apiKeyLookup?: ApiKeyLookup,
): readonly SkillEntry[] {
  const cfg = loadConfig();
  const raw = cfg.skills;
  const all = preloaded ?? loadAllSkillEntries(pluginDirs);

  const resolve = (e: SkillEntry) => resolveFullSkillConfig(e, apiKeyLookup);

  // always: true skills are loaded regardless of config
  const alwaysOn = all.filter(
    (e) => e.metadata?.always && isEligible(e, resolve(e)),
  );

  // No skills section → return only always-on skills
  if (!raw) return alwaysOn;

  let configured: SkillEntry[];

  if (raw === "all") {
    configured = all.filter((e) => isEligible(e, resolve(e)));
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    configured = all.filter((e) => {
      const sc = resolve(e);
      if (sc?.enabled === false) return false;
      return isEligible(e, sc);
    });
  } else if (Array.isArray(raw)) {
    const names = new Set(raw.map(String));
    configured = all
      .filter((e) => names.has(e.name))
      .filter((e) => isEligible(e, resolve(e)));
  } else {
    configured = [];
  }

  // Merge: configured + always-on (deduplicate by name)
  const byName = new Map<string, SkillEntry>();
  for (const e of alwaysOn) byName.set(e.name, e);
  for (const e of configured) byName.set(e.name, e);
  return Array.from(byName.values());
}

/** List all available skill names (before gating). */
export function listSkillNames(): string[] {
  return loadAllSkillEntries().map((e) => e.name);
}

// ---------------------------------------------------------------------------
// Resolved skills (with content) for agent integration
// ---------------------------------------------------------------------------

export interface ResolvedSkill {
  readonly name: string;
  readonly description: string;
  readonly content: string;
  readonly source: string;
}

/** Strip YAML frontmatter from SKILL.md content, returning the body. */
function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return (m ? m[1] : raw).trim();
}

/** Load enabled skills with full SKILL.md content (after gating). */
export function loadResolvedSkills(pluginDirs: string[] = [], apiKeyLookup?: ApiKeyLookup): ResolvedSkill[] {
  const entries = loadEnabledSkills(pluginDirs, undefined, apiKeyLookup);
  const results: ResolvedSkill[] = [];
  for (const entry of entries) {
    const content = stripFrontmatter(entry.rawContent);
    if (!content) continue;
    results.push({
      name: entry.name,
      description: entry.description,
      content,
      source: entry.filePath,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// invoke_skill tool for the agent
// ---------------------------------------------------------------------------

const InvokeSkillParams = Type.Object({
  skill: Type.String({ description: "Name of the skill to invoke" }),
});
type InvokeSkillParams = Static<typeof InvokeSkillParams>;

/** Create an invoke_skill AgentTool that returns full SKILL.md content on demand. */
export function createSkillTool(skills: readonly ResolvedSkill[]): AgentTool {
  const skillMap = new Map(skills.map((s) => [s.name, s]));
  const list = skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");

  return {
    name: "invoke_skill",
    label: "Invoke Skill",
    description: `Invoke a skill to get specialized instructions. Available skills:\n${list}`,
    parameters: InvokeSkillParams,
    async execute(_id, params: InvokeSkillParams): Promise<AgentToolResult> {
      const skill = skillMap.get(params.skill);
      if (!skill) {
        const available = [...skillMap.keys()].join(", ");
        return { content: [{ type: "text", text: `Unknown skill: "${params.skill}". Available: ${available || "none"}` }] };
      }
      return { content: [{ type: "text", text: skill.content }] };
    },
  };
}

