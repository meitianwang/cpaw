import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import yaml from "js-yaml";
import type {
  WebConfig,
  GoogleOAuthConfig,
  TranscriptsConfig,
} from "./types.js";

export const CONFIG_DIR = join(homedir(), ".klaus");
export const CONFIG_FILE = join(CONFIG_DIR, "config.yaml");

export function loadConfig(): Record<string, unknown> {
  if (!existsSync(CONFIG_FILE)) return {};
  const content = readFileSync(CONFIG_FILE, "utf-8");
  return (yaml.load(content) as Record<string, unknown>) ?? {};
}

export function getChannelNames(): string[] {
  const cfg = loadConfig();
  const raw = cfg.channel;
  if (Array.isArray(raw)) return raw.map(String);
  return [(raw as string) ?? "web"];
}

// ---------------------------------------------------------------------------
// Web config (startup-only, from YAML)
// ---------------------------------------------------------------------------

export function loadWebConfig(): WebConfig {
  const cfg = (loadConfig().web as Record<string, unknown>) ?? {};

  let google: GoogleOAuthConfig | undefined;
  const googleCfg = cfg.google as Record<string, unknown> | undefined;
  if (googleCfg) {
    const clientId =
      (googleCfg.client_id as string) ??
      process.env.KLAUS_GOOGLE_CLIENT_ID ??
      "";
    const clientSecret =
      (googleCfg.client_secret as string) ??
      process.env.KLAUS_GOOGLE_CLIENT_SECRET ??
      "";
    if (clientId && clientSecret) {
      google = { clientId, clientSecret };
    }
  }

  const rawPublicBaseUrl = (
    (cfg.public_base_url as string) ?? process.env.KLAUS_PUBLIC_BASE_URL ?? ""
  ).trim().replace(/\/+$/, "");
  let publicBaseUrl: string | undefined;
  if (rawPublicBaseUrl) {
    try {
      const u = new URL(rawPublicBaseUrl);
      if (u.protocol === "http:" || u.protocol === "https:") {
        publicBaseUrl = u.origin;  // normalized, no trailing slash or path
      }
    } catch {
      console.warn(`[Config] Invalid public_base_url: "${rawPublicBaseUrl}" — ignored`);
    }
  }

  return {
    port: Number(cfg.port ?? process.env.KLAUS_WEB_PORT ?? 3000),
    sessionMaxAgeDays: positiveNumber(cfg.session_max_age_days, 7),
    ...(google ? { google } : {}),
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
  };
}

// ---------------------------------------------------------------------------
// Transcripts config (fallback for initial seed)
// ---------------------------------------------------------------------------

export function loadTranscriptsConfig(): TranscriptsConfig {
  const cfg = (loadConfig().transcripts as Record<string, unknown>) ?? {};
  return {
    transcriptsDir: (cfg.dir as string) ?? join(CONFIG_DIR, "transcripts"),
    maxFiles: Math.floor(positiveNumber(cfg.max_files, 200)),
    maxAgeDays: positiveNumber(cfg.max_age_days, 30),
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function positiveNumber(raw: unknown, fallback: number): number {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parseRelativeTime(input: string): string | undefined {
  const trimmed = input.trim().toLowerCase();
  if (!/^\d/.test(trimmed)) return undefined;
  if (/^\d{4}-\d{2}/.test(trimmed)) return undefined;

  let totalMs = 0;
  const re = /(\d+)\s*(s|sec|m|min|h|hr|d|day)s?/g;
  let match: RegExpExecArray | null;
  let matched = false;

  while ((match = re.exec(trimmed)) !== null) {
    matched = true;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case "s":
      case "sec":
        totalMs += value * 1000;
        break;
      case "m":
      case "min":
        totalMs += value * 60 * 1000;
        break;
      case "h":
      case "hr":
        totalMs += value * 60 * 60 * 1000;
        break;
      case "d":
      case "day":
        totalMs += value * 24 * 60 * 60 * 1000;
        break;
    }
  }

  if (!matched || totalMs <= 0) return undefined;
  return new Date(Date.now() + totalMs).toISOString();
}
