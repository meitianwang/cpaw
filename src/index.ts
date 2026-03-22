import { existsSync } from "node:fs";
import { webPlugin } from "./channels/web.js";
import {
  registerChannel,
  getChannel,
  type ChannelPlugin,
} from "./channels/types.js";
import {
  getChannelNames,
  CONFIG_FILE,
  loadConfig,
  loadTranscriptsConfig,
  loadCronConfig,
  loadWebConfig,
} from "./config.js";
import { t } from "./i18n.js";
import type { InboundMessage } from "./message.js";
import { formatDisplayText } from "./message.js";
import {
  loadEnabledSkills,
  listSkillNames,
} from "./skills/index.js";
import { generateLocalToken } from "./local-token.js";

// ---------------------------------------------------------------------------
// Channel registration
// ---------------------------------------------------------------------------

registerChannel(webPlugin);

async function start(): Promise<void> {
  if (!existsSync(CONFIG_FILE)) {
    console.error("No config found. Create ~/.klaus/config.yaml first.");
    process.exit(1);
  }

  // Generate local token for macOS app authentication
  generateLocalToken();

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

  // Initialize message persistence (JSONL transcripts)
  const { MessageStore } = await import("./message-store.js");
  const messageStore = new MessageStore(loadTranscriptsConfig());
  messageStore.prune();

  // Build delivery registry from active channel plugins (needed by cron)
  const deliverers = new Map<
    string,
    (to: string, text: string) => Promise<void>
  >();
  for (const p of plugins) {
    if (p.deliver) {
      deliverers.set(p.meta.id, p.deliver);
    }
  }

  // Initialize cron scheduler if configured
  let cronScheduler: import("./cron.js").CronScheduler | null = null;
  const cronCfg = loadCronConfig();
  if (cronCfg.enabled) {
    const { CronScheduler } = await import("./cron.js");
    cronScheduler = new CronScheduler(
      { ...cronCfg, enabled: true },
      undefined, // no executor
      deliverers,
    );
    cronScheduler.start();
    console.log("[Cron] Scheduler started");
    if (channelNames.includes("web")) {
      const { setCronScheduler } = await import("./channels/web.js");
      setCronScheduler(cronScheduler);
    }
  }

  // Expose stores to web channel for API endpoints
  let inviteStoreInstance: { close(): void } | null = null;
  let userStoreInstance: { close(): void } | null = null;
  if (channelNames.includes("web")) {
    const {
      setMessageStore,
      setInviteStore,
      setUserStore,
    } = await import("./channels/web.js");
    setMessageStore(messageStore);

    const { InviteStore } = await import("./invite-store.js");
    const inviteStore = new InviteStore();
    setInviteStore(inviteStore);
    inviteStoreInstance = inviteStore;

    const { UserStore } = await import("./user-store.js");
    const webCfg = loadWebConfig();
    const sessionMaxAgeMs = webCfg.sessionMaxAgeDays * 24 * 60 * 60 * 1000;
    const userStore = new UserStore(undefined, sessionMaxAgeMs);
    setUserStore(userStore);
    userStoreInstance = userStore;

    const pruned = userStore.pruneExpiredSessions();
    if (pruned > 0) {
      console.log(`[UserStore] Pruned ${pruned} expired auth session(s)`);
    }
  }

  const handler = async (
    msg: InboundMessage,
  ): Promise<string | null> => {
    const trimmed = msg.text.trim();

    // /help — list commands
    if (trimmed === "/help") {
      return t("cmd_help");
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

    // Store message in transcripts
    const display = formatDisplayText(msg);
    if (display) {
      messageStore
        .append(msg.sessionKey, "user", display)
        .catch((err) => console.error("[MessageStore] Append failed:", err));
    }

    // No AI backend configured — return null (no reply)
    return null;
  };

  try {
    await Promise.all(plugins.map((p) => p.start(handler)));
  } finally {
    console.log("[Klaus] Shutting down...");
    cronScheduler?.stop();
    inviteStoreInstance?.close();
    userStoreInstance?.close();
    console.log("[Klaus] Cleanup complete.");
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "start";

  switch (cmd) {
    case "start":
      await start();
      break;
    default:
      console.log(
        "Klaus\n\n" +
          "Usage: klaus [command]\n\n" +
          "Commands:\n" +
          "  start    Start the server (default)\n",
      );
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
