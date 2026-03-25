import type { PromptRecord, SettingsStore } from "../../settings-store.js";
import { GatewayError } from "../errors.js";
import { requireEntityId } from "./resource-utils.js";

function normalizePromptInput(
  input: Record<string, unknown>,
  existing?: PromptRecord,
): PromptRecord {
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
    isDefault: existing?.isDefault ?? Boolean(input.is_default),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function listGatewayAdminPrompts(params: {
  settingsStore: SettingsStore;
}): { prompts: readonly PromptRecord[] } {
  return { prompts: params.settingsStore.listPrompts() };
}

export function createGatewayAdminPrompt(params: {
  settingsStore: SettingsStore;
  input: Record<string, unknown>;
}): { ok: true; prompt: PromptRecord } {
  const prompt = normalizePromptInput(params.input);
  params.settingsStore.upsertPrompt(prompt);
  if (params.input.is_default) {
    params.settingsStore.setDefaultPrompt(prompt.id);
  }
  return { ok: true, prompt: params.settingsStore.getPrompt(prompt.id) ?? prompt };
}

export function updateGatewayAdminPrompt(params: {
  settingsStore: SettingsStore;
  id: string;
  patch: Record<string, unknown>;
}): { ok: true; prompt: PromptRecord } {
  const existing = params.settingsStore.getPrompt(params.id);
  if (!existing) {
    throw GatewayError.notFound("prompt not found");
  }
  const prompt = normalizePromptInput({ ...params.patch, id: params.id }, existing);
  params.settingsStore.upsertPrompt(prompt);
  if (params.patch.is_default) {
    params.settingsStore.setDefaultPrompt(prompt.id);
  }
  return { ok: true, prompt: params.settingsStore.getPrompt(prompt.id) ?? prompt };
}

export function deleteGatewayAdminPrompt(params: {
  settingsStore: SettingsStore;
  id: string;
}): boolean {
  return params.settingsStore.deletePrompt(requireEntityId(params.id));
}
