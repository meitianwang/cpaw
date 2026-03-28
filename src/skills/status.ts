/**
 * Skill status — aggregates all discovered skills with eligibility, missing deps, and install options.
 * Used by the admin API and UI.
 */

import {
  loadEnabledSkills,
  loadAllSkillEntries,
  hasBinary,
  type KlausSkillMetadata,
} from "./index.js";
import { getSkillRegistry } from "./registry.js";
import type { InstallSpec } from "./installer.js";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillStatusEntry {
  readonly name: string;
  readonly description: string;
  readonly source: "bundled" | "user" | "plugin";
  readonly emoji?: string;
  readonly enabled: boolean;
  readonly eligible: boolean;
  readonly always: boolean;
  readonly missing: {
    readonly bins: string[];
    readonly env: string[];
  };
  readonly install: InstallSpec[];
}

// ---------------------------------------------------------------------------
// Missing deps detection
// ---------------------------------------------------------------------------

function getMissingBins(meta?: KlausSkillMetadata): string[] {
  const missing: string[] = [];
  if (!meta?.requires) return missing;

  if (meta.requires.bins) {
    for (const bin of meta.requires.bins) {
      if (!hasBinary(bin)) missing.push(bin);
    }
  }
  if (meta.requires.anyBins && meta.requires.anyBins.length > 0) {
    const hasAny = meta.requires.anyBins.some((b) => hasBinary(b));
    if (!hasAny) missing.push(...meta.requires.anyBins);
  }

  return missing;
}

function getMissingEnv(meta?: KlausSkillMetadata): string[] {
  if (!meta?.requires?.env) return [];
  return meta.requires.env.filter((e) => !process.env[e]);
}

function extractInstallSpecs(meta?: KlausSkillMetadata): InstallSpec[] {
  if (!meta?.install) return [];
  return meta.install
    .filter((s) => ["brew", "npm", "go", "uv"].includes(s.kind))
    .map((s) => ({
      id: s.id,
      kind: s.kind as InstallSpec["kind"],
      formula: s.formula,
      package: s.package,
      label: s.label,
    }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build a status report for all discovered skills (not just enabled). */
export function buildSkillStatus(): SkillStatusEntry[] {
  const registry = getSkillRegistry();
  const pluginDirs = registry.getPluginDirList();
  const allEntries = loadAllSkillEntries(pluginDirs);
  const enabledNames = new Set(
    loadEnabledSkills(pluginDirs, allEntries).map((e) => e.name),
  );

  return allEntries.map((entry) => {
    const meta = entry.metadata;
    const missingBins = getMissingBins(meta);
    const missingEnv = getMissingEnv(meta);

    return {
      name: entry.name,
      description: entry.description,
      source: entry.source,
      emoji: meta?.emoji,
      enabled: enabledNames.has(entry.name),
      eligible: missingBins.length === 0 && missingEnv.length === 0,
      always: meta?.always ?? false,
      missing: { bins: missingBins, env: missingEnv },
      install: extractInstallSpecs(meta),
    };
  });
}
