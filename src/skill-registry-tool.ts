/**
 * Skill registry MCP tools — find_skills + install_skill.
 *
 * Lets Claude search online registries and install skills on behalf of the user.
 */

import { z } from "zod/v4";
import {
  tool,
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import type { RegistryManager } from "./skills/registry/registry-manager.js";

// ---------------------------------------------------------------------------
// Tool descriptions
// ---------------------------------------------------------------------------

const FIND_SKILLS_DESCRIPTION = `Search online skill registries for installable skills.

Use this when the user needs a capability that isn't available locally,
or when they ask to find/search for skills or plugins.

Returns a list of matching skills with name, description, version, and registry source.
Skills marked as "installed" are already available locally.

Examples:
- "搜索 PDF 相关的技能" → find_skills({ query: "pdf" })
- "有没有视频处理的插件" → find_skills({ query: "video" })`;

const INSTALL_SKILL_DESCRIPTION = `Install a skill from an online registry.

Use this after find_skills to install a skill the user wants.
The skill will be downloaded and installed to ~/.klaus/skills/{slug}/.
After installation, the skill is immediately available.

RULES:
- Always use find_skills first to get the correct slug and registry
- If the skill is flagged as suspicious, inform the user before proceeding
- If the skill is blocked (malware), installation will be refused automatically

Examples:
- install_skill({ slug: "nano-pdf", registry: "picoclaw" })
- install_skill({ slug: "video-frames", registry: "openclaw", version: "1.2.0" })`;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const FindSkillsInput = {
  query: z.string().describe("Search query (e.g. 'pdf', 'video', 'code review')"),
  limit: z
    .number()
    .optional()
    .describe("Max results to return (default 10, max 30)"),
};

const InstallSkillInput = {
  slug: z.string().describe("Skill slug from find_skills results"),
  registry: z.string().describe("Registry ID (e.g. 'picoclaw', 'openclaw')"),
  version: z
    .string()
    .optional()
    .describe("Specific version to install (default: latest)"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleFindSkills(
  manager: RegistryManager,
  args: Record<string, unknown>,
) {
  const query = String(args.query ?? "").trim();
  if (!query) throw new Error("Missing required field: query");

  const limit = Math.min(Math.max(1, Number(args.limit ?? 10)), 30);
  const results = await manager.search(query, limit);

  // Enrich with installed status
  const enriched = results.map((r) => {
    const origin = manager.getInstalledOrigin(r.slug);
    return {
      ...r,
      installed: manager.isInstalled(r.slug),
      installedVersion: origin?.version ?? null,
    };
  });

  if (enriched.length === 0) {
    return textResult({
      message: "No skills found matching your query.",
      results: [],
      registries: manager.registryIds,
    });
  }

  return textResult({ results: enriched });
}

async function handleInstallSkill(
  manager: RegistryManager,
  args: Record<string, unknown>,
) {
  const slug = String(args.slug ?? "").trim();
  const registry = String(args.registry ?? "").trim();
  if (!slug) throw new Error("Missing required field: slug");
  if (!registry) throw new Error("Missing required field: registry");

  const version = args.version ? String(args.version).trim() : undefined;

  const result = await manager.install(registry, slug, version);

  return textResult({
    status: "installed",
    slug: result.slug,
    version: result.version,
    path: result.path,
    ...(result.warning ? { warning: result.warning } : {}),
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface SkillRegistryToolContext {
  readonly manager: RegistryManager | null;
  ensureManager(): Promise<RegistryManager>;
}

export function createSkillRegistryMcpServer(
  ctx: SkillRegistryToolContext,
): McpSdkServerConfigWithInstance {
  const getManager = async (): Promise<RegistryManager> => {
    return ctx.manager ?? (await ctx.ensureManager());
  };

  const findSkillsTool = tool(
    "find_skills",
    FIND_SKILLS_DESCRIPTION,
    FindSkillsInput,
    async (args) => {
      const manager = await getManager();
      return handleFindSkills(manager, args as Record<string, unknown>);
    },
  );

  const installSkillTool = tool(
    "install_skill",
    INSTALL_SKILL_DESCRIPTION,
    InstallSkillInput,
    async (args) => {
      const manager = await getManager();
      return handleInstallSkill(manager, args as Record<string, unknown>);
    },
  );

  return createSdkMcpServer({
    name: "klaus-skill-registry",
    tools: [findSkillsTool, installSkillTool],
  });
}
