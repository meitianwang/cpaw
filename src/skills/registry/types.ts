/**
 * Types for the online skill registry system.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface RegistryConfig {
  readonly id: string;
  readonly url: string;
  readonly enabled: boolean;
  readonly authToken?: string;
}

// ---------------------------------------------------------------------------
// Search results
// ---------------------------------------------------------------------------

export interface RegistrySearchHit {
  readonly registryId: string;
  readonly score: number;
  readonly slug: string;
  readonly displayName: string;
  readonly summary: string;
  readonly version: string;
}

// ---------------------------------------------------------------------------
// Skill detail (with moderation)
// ---------------------------------------------------------------------------

export interface RegistrySkillDetail {
  readonly registryId: string;
  readonly slug: string;
  readonly displayName: string;
  readonly summary: string;
  readonly latestVersion: string;
  readonly moderation: {
    readonly isMalwareBlocked: boolean;
    readonly isSuspicious: boolean;
  };
}

// ---------------------------------------------------------------------------
// Origin metadata (persisted alongside installed SKILL.md)
// ---------------------------------------------------------------------------

export interface SkillOrigin {
  readonly registryId: string;
  readonly slug: string;
  readonly version: string;
  readonly installedAt: number;
  readonly url: string;
}

// ---------------------------------------------------------------------------
// Registry interface
// ---------------------------------------------------------------------------

export interface SkillRegistry {
  readonly id: string;
  search(query: string, limit: number): Promise<readonly RegistrySearchHit[]>;
  getDetail(slug: string): Promise<RegistrySkillDetail>;
  download(slug: string, version: string): Promise<Buffer>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function validateSlug(slug: string): string {
  if (!SAFE_SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid skill slug "${slug}". Use lowercase letters, numbers, dash, underscore, dot (max 64 chars).`,
    );
  }
  return slug;
}
