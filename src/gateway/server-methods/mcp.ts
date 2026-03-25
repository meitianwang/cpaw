import type {
  McpServerRecord,
  McpTransportConfig,
  SettingsStore,
} from "../../settings-store.js";
import { GatewayError } from "../errors.js";
import { requireEntityId } from "./resource-utils.js";

function normalizeMcpServerInput(
  input: Record<string, unknown>,
  existing?: McpServerRecord,
): McpServerRecord {
  const now = Date.now();
  const id = requireEntityId(
    "id" in input ? String(input.id ?? "") : (existing?.id ?? ""),
  );

  const transport = "transport" in input
    ? (input.transport as Record<string, unknown> | undefined)
    : undefined;
  const nextTransport = transport
    ? (transport as McpTransportConfig)
    : existing?.transport;
  if (!nextTransport || !("type" in nextTransport) || !nextTransport.type) {
    throw GatewayError.badRequest("transport with type is required");
  }

  return {
    id,
    name:
      "name" in input
        ? String(input.name ?? id)
        : (existing?.name ?? id),
    transport: nextTransport,
    enabled:
      "enabled" in input
        ? Boolean(input.enabled)
        : (existing?.enabled ?? true),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function listGatewayAdminMcpServers(params: {
  settingsStore: SettingsStore;
}): { servers: readonly McpServerRecord[] } {
  return { servers: params.settingsStore.listMcpServers() };
}

export function createGatewayAdminMcpServer(params: {
  settingsStore: SettingsStore;
  input: Record<string, unknown>;
}): { ok: true; server: McpServerRecord } {
  const server = normalizeMcpServerInput(params.input);
  params.settingsStore.upsertMcpServer(server);
  return { ok: true, server: params.settingsStore.getMcpServer(server.id) ?? server };
}

export function updateGatewayAdminMcpServer(params: {
  settingsStore: SettingsStore;
  id: string;
  patch: Record<string, unknown>;
}): { ok: true; server: McpServerRecord } {
  const existing = params.settingsStore.getMcpServer(params.id);
  if (!existing) {
    throw GatewayError.notFound("server not found");
  }
  const server = normalizeMcpServerInput(
    { ...params.patch, id: params.id },
    existing,
  );
  params.settingsStore.upsertMcpServer(server);
  return { ok: true, server: params.settingsStore.getMcpServer(server.id) ?? server };
}

export function deleteGatewayAdminMcpServer(params: {
  settingsStore: SettingsStore;
  id: string;
}): boolean {
  return params.settingsStore.deleteMcpServer(requireEntityId(params.id));
}
