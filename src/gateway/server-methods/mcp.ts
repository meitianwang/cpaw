/**
 * Gateway MCP server CRUD — uses the engine's .mcp.json config system
 * (getAllMcpConfigs / addMcpConfig / removeMcpConfig) instead of SQLite.
 */

import {
  getAllMcpConfigs,
  addMcpConfig,
  removeMcpConfig,
} from "../../engine/services/mcp/config.js";
import type { ScopedMcpServerConfig } from "../../engine/services/mcp/types.js";
import { GatewayError } from "../errors.js";

/** Serializable MCP server record for admin API responses. */
export interface McpServerInfo {
  readonly name: string;
  readonly scope: string;
  readonly config: ScopedMcpServerConfig;
}

export async function listGatewayAdminMcpServers(): Promise<{
  servers: readonly McpServerInfo[];
}> {
  const { servers } = await getAllMcpConfigs();
  const result: McpServerInfo[] = Object.entries(servers).map(
    ([name, config]) => ({
      name,
      scope: config.scope,
      config,
    }),
  );
  return { servers: result };
}

export async function createGatewayAdminMcpServer(params: {
  input: Record<string, unknown>;
}): Promise<{ ok: true; name: string }> {
  const { name, scope, ...config } = params.input as {
    name?: string;
    scope?: string;
    [k: string]: unknown;
  };
  if (!name) throw GatewayError.badRequest("name is required");
  const targetScope = (scope as "project" | "user" | "local") ?? "user";
  await addMcpConfig(name, config, targetScope);
  return { ok: true, name };
}

export async function deleteGatewayAdminMcpServer(params: {
  name: string;
  scope?: string;
}): Promise<boolean> {
  const targetScope = (params.scope as "project" | "user" | "local") ?? "user";
  try {
    await removeMcpConfig(params.name, targetScope);
    return true;
  } catch {
    return false;
  }
}
