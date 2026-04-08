/**
 * Gateway MCP server CRUD — direct per-user .mcp.json file I/O.
 *
 * Does NOT use the engine's global-state-dependent getAllMcpConfigs /
 * addMcpConfig / removeMcpConfig, because those rely on the global
 * `currentMcpUserConfigPath` which is protected by agent-manager's
 * skillMutex.  Gateway CRUD is independent of the engine query pipeline.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getUserMcpConfigPath } from "../../user-dirs.js";
import { GatewayError } from "../errors.js";

/** Serializable MCP server record for API responses. */
export interface McpServerInfo {
  readonly name: string;
  readonly scope: string;
  readonly config: Record<string, unknown>;
}

interface McpJsonFile {
  mcpServers: Record<string, Record<string, unknown>>;
}

function readUserMcpJson(userId: string): McpJsonFile {
  const filePath = getUserMcpConfigPath(userId);
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return { mcpServers: parsed?.mcpServers ?? {} };
  } catch {
    return { mcpServers: {} };
  }
}

function writeUserMcpJson(userId: string, data: McpJsonFile): void {
  const filePath = getUserMcpConfigPath(userId);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function listGatewayMcpServers(userId: string): Promise<{
  servers: readonly McpServerInfo[];
}> {
  const { mcpServers } = readUserMcpJson(userId);
  const result: McpServerInfo[] = Object.entries(mcpServers).map(
    ([name, config]) => ({
      name,
      scope: "user",
      config,
    }),
  );
  return { servers: result };
}

export async function createGatewayMcpServer(params: {
  userId: string;
  input: Record<string, unknown>;
}): Promise<{ ok: true; name: string }> {
  const { name, ...config } = params.input as {
    name?: string;
    [k: string]: unknown;
  };
  if (!name) throw GatewayError.badRequest("name is required");
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw GatewayError.badRequest("Invalid name: only letters, numbers, hyphens, and underscores allowed");
  }

  const data = readUserMcpJson(params.userId);
  if (data.mcpServers[name]) {
    throw GatewayError.badRequest(`MCP server ${name} already exists`);
  }
  data.mcpServers[name] = config;
  writeUserMcpJson(params.userId, data);
  return { ok: true, name };
}

export async function deleteGatewayMcpServer(params: {
  userId: string;
  name: string;
}): Promise<boolean> {
  const data = readUserMcpJson(params.userId);
  if (!data.mcpServers[params.name]) return false;
  delete data.mcpServers[params.name];
  writeUserMcpJson(params.userId, data);
  return true;
}
