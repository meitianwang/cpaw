/**
 * Registry manager — fan-out search across multiple registries + skill installation.
 */

import { join, resolve } from "node:path";
import {
  mkdirSync,
  writeFileSync,
  renameSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { CONFIG_DIR } from "../../config.js";
import type {
  RegistryConfig,
  RegistrySearchHit,
  RegistrySkillDetail,
  SkillOrigin,
  SkillRegistry,
} from "./types.js";
import { validateSlug } from "./types.js";
import { ClawHubRegistry } from "./clawhub-registry.js";
import { SearchCache } from "./search-cache.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_SKILLS_DIR = join(CONFIG_DIR, "skills");
const MAX_SEARCH_LIMIT = 30;

// ---------------------------------------------------------------------------
// Registry manager
// ---------------------------------------------------------------------------

export class RegistryManager {
  private readonly registries: readonly SkillRegistry[];
  private readonly registryUrls: ReadonlyMap<string, string>;
  private readonly cache: SearchCache;
  /** Prevent concurrent installs of the same slug. */
  private readonly installing = new Map<string, Promise<InstallResult>>();

  constructor(configs: readonly RegistryConfig[]) {
    const enabled = configs.filter((c) => c.enabled && c.id && c.url);
    this.registries = enabled.map(
      (c) => new ClawHubRegistry(c.id, c.url, c.authToken),
    );
    this.registryUrls = new Map(enabled.map((c) => [c.id, c.url]));
    this.cache = new SearchCache();
  }

  // --- Search ---

  async search(
    query: string,
    limit = 10,
  ): Promise<readonly RegistrySearchHit[]> {
    const clampedLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);

    // Check cache
    const cached = this.cache.get(query);
    if (cached) return cached.slice(0, clampedLimit);

    // Fan-out search (tolerate partial failures)
    const results = await Promise.allSettled(
      this.registries.map((r) => r.search(query, clampedLimit)),
    );

    const merged = results
      .filter(
        (r): r is PromiseFulfilledResult<readonly RegistrySearchHit[]> =>
          r.status === "fulfilled",
      )
      .flatMap((r) => r.value)
      .sort((a, b) => b.score - a.score)
      .slice(0, clampedLimit);

    // Log failures
    for (const r of results) {
      if (r.status === "rejected") {
        console.warn(`[SkillRegistry] Search failed:`, r.reason);
      }
    }

    this.cache.set(query, merged);
    return merged;
  }

  // --- Install ---

  async install(
    registryId: string,
    slug: string,
    version?: string,
  ): Promise<InstallResult> {
    validateSlug(slug);

    // Deduplicate concurrent installs of the same slug
    const existing = this.installing.get(slug);
    if (existing) return existing;

    const promise = this.doInstall(registryId, slug, version).finally(() => {
      this.installing.delete(slug);
    });
    this.installing.set(slug, promise);
    return promise;
  }

  private async doInstall(
    registryId: string,
    slug: string,
    version?: string,
  ): Promise<InstallResult> {
    const registry = this.registries.find((r) => r.id === registryId);
    if (!registry) {
      throw new Error(
        `Registry "${registryId}" not found. Available: ${this.registries.map((r) => r.id).join(", ")}`,
      );
    }

    // 1. Get detail + moderation check
    const detail = await registry.getDetail(slug);
    if (detail.moderation.isMalwareBlocked) {
      throw new Error(
        `Skill "${slug}" is blocked by ${registryId}: malware detected. Installation refused.`,
      );
    }

    const resolvedVersion = version ?? detail.latestVersion;
    const warning = detail.moderation.isSuspicious
      ? `Warning: skill "${slug}" is flagged as suspicious by ${registryId}.`
      : undefined;

    // 2. Download ZIP
    const zipBuffer = await registry.download(slug, resolvedVersion);

    // 3. Extract to temp dir
    const tmpBase = join(tmpdir(), `klaus-skill-${slug}-${Date.now()}`);
    const tmpZipPath = `${tmpBase}.zip`;
    const tmpExtractDir = tmpBase;

    try {
      writeFileSync(tmpZipPath, zipBuffer, { mode: 0o600 });
      mkdirSync(tmpExtractDir, { recursive: true });

      execFileSync("unzip", ["-o", "-q", tmpZipPath, "-d", tmpExtractDir], {
        timeout: 15_000,
      });

      // 4. Locate SKILL.md (may be at root or in a subdirectory)
      const skillMdPath = findSkillMd(tmpExtractDir);
      if (!skillMdPath) {
        throw new Error(
          `Invalid skill package: no SKILL.md found in "${slug}" archive`,
        );
      }

      // 5. Atomic install to ~/.klaus/skills/{slug}/
      const targetDir = join(USER_SKILLS_DIR, slug);
      const tmpTargetDir = `${targetDir}.tmp-${Date.now()}`;

      // Determine source dir (the directory containing SKILL.md)
      const sourceDir = join(
        tmpExtractDir,
        skillMdPath.replace(/\/SKILL\.md$/, ""),
      );

      mkdirSync(tmpTargetDir, { recursive: true });
      // Copy all files from source to tmp target
      copyDirSync(sourceDir, tmpTargetDir);

      // Write origin.json
      const origin: SkillOrigin = {
        registryId,
        slug,
        version: resolvedVersion,
        installedAt: Date.now(),
        url: this.registryUrls.get(registryId) ?? registryId,
      };
      writeFileSync(
        join(tmpTargetDir, "origin.json"),
        JSON.stringify(origin, null, 2),
        { mode: 0o600 },
      );

      // Atomic swap
      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
      }
      renameSync(tmpTargetDir, targetDir);

      console.log(
        `[SkillRegistry] Installed ${slug}@${resolvedVersion} from ${registryId} → ${targetDir}`,
      );

      return {
        slug,
        version: resolvedVersion,
        path: join(targetDir, "SKILL.md"),
        origin,
        warning,
      };
    } finally {
      // Cleanup temp files
      rmSync(tmpZipPath, { force: true });
      rmSync(tmpExtractDir, { recursive: true, force: true });
    }
  }

  // --- Installed skill info ---

  /** Read origin.json for an installed skill, or null if not from a registry. */
  getInstalledOrigin(slug: string): SkillOrigin | null {
    try {
      const originPath = join(USER_SKILLS_DIR, slug, "origin.json");
      const raw = readFileSync(originPath, "utf-8");
      return JSON.parse(raw) as SkillOrigin;
    } catch {
      return null;
    }
  }

  /** Check if a skill is installed in the user skills dir. */
  isInstalled(slug: string): boolean {
    return existsSync(join(USER_SKILLS_DIR, slug, "SKILL.md"));
  }

  /** List registry IDs. */
  get registryIds(): readonly string[] {
    return this.registries.map((r) => r.id);
  }
}

// ---------------------------------------------------------------------------
// Install result
// ---------------------------------------------------------------------------

export interface InstallResult {
  readonly slug: string;
  readonly version: string;
  readonly path: string;
  readonly origin: SkillOrigin;
  readonly warning?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively find SKILL.md in an extracted directory. Returns relative path or null. */
function findSkillMd(dir: string): string | null {
  // Check root first
  if (existsSync(join(dir, "SKILL.md"))) return "SKILL.md";

  // Check one level of subdirectories
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const sub = join(entry.name, "SKILL.md");
        if (existsSync(join(dir, sub))) return sub;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/** Recursively copy directory contents. */
function copyDirSync(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      const content = readFileSync(srcPath);
      writeFileSync(destPath, content, { mode: 0o644 });
    }
  }
}
