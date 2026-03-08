import { existsSync } from "node:fs";
import { qqPlugin } from "./channels/qq.js";
import { wecomPlugin } from "./channels/wecom.js";
import { webPlugin } from "./channels/web.js";
import {
  registerChannel,
  getChannel,
  type ChannelPlugin,
} from "./channels/types.js";
import {
  getChannelNames,
  CONFIG_FILE,
  loadSessionConfig,
  loadTranscriptsConfig,
  loadCronConfig,
} from "./config.js";
import { ensureConfigValid } from "./config-validate.js";
import { ChatSessionManager } from "./core.js";
import { t } from "./i18n.js";
import { type InboundMessage, formatPrompt } from "./message.js";
import {
  loadEnabledSkills,
  listSkillNames,
  applySkillEnvOverrides,
} from "./skills/index.js";
import type {
  ToolEventCallback,
  StreamChunkCallback,
  PermissionRequestCallback,
} from "./types.js";

// ---------------------------------------------------------------------------
// Channel registration
// ---------------------------------------------------------------------------

registerChannel(qqPlugin);
registerChannel(wecomPlugin);
registerChannel(webPlugin);

// ---------------------------------------------------------------------------
// Model alias mapping
// ---------------------------------------------------------------------------

const MODEL_ALIASES: Record<string, string> = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

async function start(): Promise<void> {
  if (!existsSync(CONFIG_FILE)) {
    console.log("No config found. Starting setup wizard...\n");
    const { runSetup } = await import("./setup-wizard.js");
    await runSetup();
    if (!existsSync(CONFIG_FILE)) return;
  }

  // Validate config before attempting to connect (fail-fast)
  ensureConfigValid();

  // Apply skill environment overrides (scoped to process lifetime)
  applySkillEnvOverrides();

  const channelNames = getChannelNames();
  const plugins: ChannelPlugin[] = [];
  for (const name of channelNames) {
    const plugin = getChannel(name);
    if (!plugin) {
      console.error(`Internal error: channel "${name}" not registered.`);
      process.exit(1);
    }
    plugins.push(plugin);
  }

  // Initialize session persistence
  const sessionCfg = loadSessionConfig();
  const { SessionStore } = await import("./session-store.js");
  const store = new SessionStore();
  await store.load();
  store.pruneStale(sessionCfg.maxAgeMs);
  store.capEntries(sessionCfg.maxEntries);
  await store.save();

  // Initialize message persistence (JSONL transcripts)
  const { MessageStore } = await import("./message-store.js");
  const messageStore = new MessageStore(loadTranscriptsConfig());
  messageStore.prune();

  // Initialize per-user memory store
  const { MemoryStore } = await import("./memory-store.js");
  const memoryStore = new MemoryStore();

  const sessions = new ChatSessionManager(
    store,
    sessionCfg.idleMs,
    messageStore,
    memoryStore,
  );

  // Initialize cron scheduler (if configured)
  let cronScheduler: import("./cron.js").CronScheduler | null = null;
  const cronCfg = loadCronConfig();
  if (cronCfg.enabled && cronCfg.tasks.length > 0) {
    // Build delivery registry from active channel plugins
    const deliverers = new Map<
      string,
      (to: string, text: string) => Promise<void>
    >();
    for (const p of plugins) {
      if (p.deliver) {
        deliverers.set(p.meta.id, p.deliver);
      }
    }
    const { CronScheduler } = await import("./cron.js");
    cronScheduler = new CronScheduler(cronCfg.tasks, sessions, deliverers);
    cronScheduler.start();
  }

  // Expose stores to web channel for API endpoints
  let inviteStoreInstance: { close(): void } | null = null;
  let userStoreInstance: { close(): void } | null = null;
  if (channelNames.includes("web")) {
    const {
      setMessageStore,
      setInviteStore,
      setSessionStore,
      setUserStore,
      setChatManager,
    } = await import("./channels/web.js");
    setMessageStore(messageStore);
    setSessionStore(store);
    setChatManager(sessions);

    const { InviteStore } = await import("./invite-store.js");
    const inviteStore = new InviteStore();
    setInviteStore(inviteStore);
    inviteStoreInstance = inviteStore;

    const { UserStore } = await import("./user-store.js");
    const { loadWebConfig } = await import("./config.js");
    const webCfg = loadWebConfig();
    const sessionMaxAgeMs = webCfg.sessionMaxAgeDays * 24 * 60 * 60 * 1000;
    const userStore = new UserStore(undefined, sessionMaxAgeMs);
    setUserStore(userStore);
    userStoreInstance = userStore;

    // Prune expired auth sessions on startup
    const pruned = userStore.pruneExpiredSessions();
    if (pruned > 0) {
      console.log(`[UserStore] Pruned ${pruned} expired auth session(s)`);
    }
  }

  const handler = async (
    msg: InboundMessage,
    onToolEvent?: ToolEventCallback,
    onStreamChunk?: StreamChunkCallback,
    onPermissionRequest?: PermissionRequestCallback,
  ): Promise<string | null> => {
    const trimmed = msg.text.trim();

    // /new, /reset, /clear — reset conversation
    if (["/new", "/reset", "/clear"].includes(trimmed)) {
      await sessions.reset(msg.sessionKey);
      return t("cmd_reset");
    }

    // /help — list commands
    if (trimmed === "/help") {
      return t("cmd_help");
    }

    // /session — show session info
    if (trimmed === "/session") {
      const info = sessions.getSessionInfo(msg.sessionKey);
      return t("cmd_session_info", {
        key: msg.sessionKey,
        status: info.busy ? t("cmd_session_active") : t("cmd_session_idle"),
        model: info.model ?? t("cmd_default_model"),
      });
    }

    // /skills — list enabled skills
    if (trimmed === "/skills") {
      const enabled = loadEnabledSkills();
      if (enabled.length === 0) {
        return t("cmd_skills_none", {
          available: listSkillNames().join(", "),
        });
      }
      const list = enabled
        .map((s) => {
          const emoji = s.metadata?.emoji ? `${s.metadata.emoji} ` : "";
          const src = s.source === "user" ? " (user)" : "";
          return `  ${emoji}${s.name} — ${s.description}${src}`;
        })
        .join("\n");
      return t("cmd_skills_list", { list, count: String(enabled.length) });
    }

    // /cron — show cron task status
    if (trimmed === "/cron") {
      if (!cronScheduler) {
        return t("cmd_cron_disabled");
      }
      const status = cronScheduler.getStatus();
      if (status.length === 0) {
        return t("cmd_cron_empty");
      }
      const lines = status.map((s) => {
        const state = s.enabled ? "✓" : "✗";
        const last = s.lastRun
          ? `${s.lastRun.status === "ok" ? "✓" : "✗"} ${new Date(s.lastRun.finishedAt).toLocaleString()}`
          : "-";
        const next = s.nextRun ? new Date(s.nextRun).toLocaleString() : "-";
        return `  ${state} ${s.id}${s.name ? ` (${s.name})` : ""}\n    schedule: ${s.schedule}\n    last: ${last} | next: ${next}`;
      });
      return t("cmd_cron_list", {
        count: String(status.length),
        list: lines.join("\n"),
      });
    }

    // /model [name] — show or switch model
    if (trimmed === "/model" || trimmed.startsWith("/model ")) {
      const arg = trimmed.slice("/model".length).trim();
      if (!arg) {
        const current = sessions.getModel(msg.sessionKey);
        return t("cmd_model_current", {
          model: current ?? t("cmd_default_model"),
        });
      }
      const resolved = MODEL_ALIASES[arg.toLowerCase()] ?? MODEL_ALIASES[arg];
      if (!resolved) {
        return t("cmd_model_unknown", { name: arg });
      }
      sessions.setModel(msg.sessionKey, resolved);
      return t("cmd_model_switched", { model: resolved });
    }

    const prompt = formatPrompt(msg);
    if (!prompt) return null;
    return sessions.chat(
      msg.sessionKey,
      prompt,
      onToolEvent,
      onStreamChunk,
      onPermissionRequest,
    );
  };

  try {
    // Start all channels in parallel (each blocks forever).
    // If any rejects, Promise.all rejects → finally runs → process.exit(1) in main().
    await Promise.all(plugins.map((p) => p.start(handler)));
  } finally {
    cronScheduler?.stop();
    await sessions.close();
    inviteStoreInstance?.close();
    userStoreInstance?.close();
  }
}

function main(): void {
  const cmd = process.argv[2] ?? "start";

  switch (cmd) {
    case "setup":
      import("./setup-wizard.js")
        .then((m) => m.runSetup())
        .then(() => process.exit(0))
        .catch((err) => {
          console.error(err);
          process.exit(1);
        });
      break;
    case "doctor":
      import("./doctor.js")
        .then((m) => m.runDoctor())
        .then(() => process.exit(0))
        .catch((err) => {
          console.error(err);
          process.exit(1);
        });
      break;
    case "start":
      start().catch((err) => {
        console.error(err);
        process.exit(1);
      });
      break;
    default:
      console.log(
        "Klaus — Use Claude Code from any messaging platform\n\n" +
          "Usage: klaus [command]\n\n" +
          "Commands:\n" +
          "  setup    Interactive setup wizard\n" +
          "  start    Start the bot (default)\n" +
          "  doctor   Diagnose environment issues\n",
      );
      process.exit(1);
  }
}

main();
