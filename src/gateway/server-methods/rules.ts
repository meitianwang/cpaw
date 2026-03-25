import type { RuleRecord, SettingsStore } from "../../settings-store.js";
import { GatewayError } from "../errors.js";
import { requireEntityId } from "./resource-utils.js";

function normalizeRuleInput(
  input: Record<string, unknown>,
  existing?: RuleRecord,
): RuleRecord {
  const now = Date.now();
  const id = requireEntityId(
    "id" in input ? String(input.id ?? "") : (existing?.id ?? ""),
  );

  const content =
    "content" in input ? String(input.content ?? "") : (existing?.content ?? "");
  if (!existing && !content.trim()) {
    throw GatewayError.badRequest("content is required");
  }

  return {
    id,
    name:
      "name" in input
        ? String(input.name ?? id)
        : (existing?.name ?? id),
    content,
    enabled:
      "enabled" in input
        ? Boolean(input.enabled)
        : (existing?.enabled ?? true),
    sortOrder:
      "sort_order" in input
        ? Number(input.sort_order)
        : (existing?.sortOrder ?? 0),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function listGatewayAdminRules(params: {
  settingsStore: SettingsStore;
}): { rules: readonly RuleRecord[] } {
  return { rules: params.settingsStore.listRules() };
}

export function createGatewayAdminRule(params: {
  settingsStore: SettingsStore;
  input: Record<string, unknown>;
}): { ok: true; rule: RuleRecord } {
  const rule = normalizeRuleInput(params.input);
  params.settingsStore.upsertRule(rule);
  return { ok: true, rule };
}

export function updateGatewayAdminRule(params: {
  settingsStore: SettingsStore;
  id: string;
  patch: Record<string, unknown>;
}): { ok: true; rule: RuleRecord } {
  const existing = params.settingsStore.listRules().find((rule) => rule.id === params.id);
  if (!existing) {
    throw GatewayError.notFound("rule not found");
  }
  const rule = normalizeRuleInput({ ...params.patch, id: params.id }, existing);
  params.settingsStore.upsertRule(rule);
  return { ok: true, rule };
}

export function deleteGatewayAdminRule(params: {
  settingsStore: SettingsStore;
  id: string;
}): boolean {
  return params.settingsStore.deleteRule(requireEntityId(params.id));
}
