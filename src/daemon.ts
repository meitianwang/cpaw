/**
 * Daemon management — PID file, log rotation, process lifecycle.
 *
 * `klaus start`       → fork child in background, parent exits immediately
 * `klaus start -f`    → run in foreground (current behavior)
 * `klaus stop`        → send SIGTERM to daemon
 * `klaus status`      → check if daemon is running
 */

import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  openSync,
  statSync,
  renameSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PID_FILE = join(CONFIG_DIR, "klaus.pid");
const LOG_DIR = join(CONFIG_DIR, "logs");
const LOG_FILE = join(LOG_DIR, "klaus.log");

// ---------------------------------------------------------------------------
// PID helpers
// ---------------------------------------------------------------------------

function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  const raw = readFileSync(PID_FILE, "utf-8").trim();
  const pid = parseInt(raw, 10);
  return Number.isFinite(pid) ? pid : null;
}

/** Atomic PID write using exclusive create ('wx') to prevent races. */
function writePidExclusive(pid: number): boolean {
  mkdirSync(CONFIG_DIR, { recursive: true });
  try {
    writeFileSync(PID_FILE, String(pid), { mode: 0o644, flag: "wx" });
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
}

/** Overwrite PID file (used after stale PID cleanup). */
function writePid(pid: number): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(pid), { mode: 0o644 });
}

function removePid(): void {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // ignore if already gone
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = existence check
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fork `klaus start --foreground` as a detached background process.
 * Redirects stdout/stderr to the log file.
 * The parent process exits after the child is spawned.
 */
export function daemonize(): void {
  mkdirSync(LOG_DIR, { recursive: true });
  rotateLogs();

  // Try atomic PID file creation first (prevents race between concurrent starts)
  const existingPid = readPid();
  if (existingPid !== null) {
    if (isProcessRunning(existingPid)) {
      console.log(`Klaus is already running (PID ${existingPid}).`);
      console.log(`Log: ${LOG_FILE}`);
      process.exit(0);
    }
    // Stale PID file — remove and retry
    removePid();
  }

  // Reserve PID file atomically BEFORE spawning to prevent race conditions.
  // Write a placeholder (parent PID) — will be overwritten with child PID.
  if (!writePidExclusive(process.pid)) {
    // Another daemonize() call won the race
    console.log("Klaus is already starting from another process.");
    process.exit(0);
  }

  // Open log file for append
  const logFd = openSync(LOG_FILE, "a");

  // Re-spawn ourselves with --foreground
  const scriptArgs = getScriptArgs();
  const child = spawn(process.execPath, [...scriptArgs, "--foreground"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      PATH: [process.env.PATH, "/opt/homebrew/bin", "/usr/local/bin"]
        .filter(Boolean)
        .join(":"),
    },
  });

  child.unref();

  const childPid = child.pid;
  if (childPid == null) {
    removePid();
    console.error("Failed to start daemon.");
    process.exit(1);
  }

  // Overwrite placeholder with actual child PID
  writePid(childPid);

  console.log(`Klaus started in background (PID ${childPid}).`);
  console.log(`Log: ${LOG_FILE}`);
  process.exit(0);
}

/**
 * Global shutdown controller — lazy-initialized by registerForegroundPid().
 * Only the foreground `klaus start -f` process needs it; other subcommands
 * (stop, status, logs) import this module but never trigger shutdown.
 */
let shutdownController: AbortController | null = null;

/** Signal that fires on SIGTERM / SIGINT. Channels listen to this. */
export function getShutdownSignal(): AbortSignal {
  shutdownController ??= new AbortController();
  return shutdownController.signal;
}

/**
 * Write PID file for foreground mode (so `klaus stop` still works).
 * Registers cleanup on exit.
 */
export function registerForegroundPid(): void {
  // Prevent overwriting an active daemon's PID
  const existing = readPid();
  if (
    existing !== null &&
    isProcessRunning(existing) &&
    existing !== process.pid
  ) {
    console.error(
      `Klaus is already running as daemon (PID ${existing}). Stop it first with: klaus stop`,
    );
    process.exit(1);
  }
  mkdirSync(LOG_DIR, { recursive: true });
  rotateLogs();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Klaus starting at ${new Date().toISOString()} (PID ${process.pid})`);
  console.log(`${"=".repeat(60)}`);
  writePid(process.pid);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    removePid();
  };
  process.on("exit", cleanup);

  // SIGTERM / SIGINT: trigger shutdown signal so async cleanup can run.
  // The main loop catches the AbortError, runs finally blocks, then exits.
  const ctrl = (shutdownController ??= new AbortController());
  const onSignal = () => {
    cleanup();
    if (!ctrl.signal.aborted) {
      ctrl.abort();
    }
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
}

/**
 * Stop a running daemon by sending SIGTERM.
 * Waits up to 5 seconds for the process to exit before giving up.
 */
export async function stopDaemon(): Promise<void> {
  const pid = readPid();
  if (pid === null) {
    console.log("Klaus is not running (no PID file found).");
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log(`Klaus is not running (stale PID ${pid}). Cleaning up.`);
    removePid();
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    console.log(`Sent SIGTERM to Klaus (PID ${pid}). Waiting for exit...`);
  } catch (err) {
    console.error(`Failed to stop Klaus (PID ${pid}):`, err);
    process.exit(1);
  }

  // Poll until process exits (up to 5s)
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      removePid();
      console.log("Klaus stopped.");
      return;
    }
    await sleep(200);
  }

  console.log(`Klaus (PID ${pid}) did not exit within 5s. Sending SIGKILL...`);
  try {
    process.kill(pid, "SIGKILL");
  } catch {}

  // Wait briefly for SIGKILL to take effect
  const killDeadline = Date.now() + 2_000;
  while (Date.now() < killDeadline) {
    if (!isProcessRunning(pid)) {
      removePid();
      console.log("Klaus killed.");
      return;
    }
    await sleep(200);
  }

  console.log(
    `Klaus (PID ${pid}) could not be stopped. Manual intervention required.`,
  );
}

/**
 * Print daemon status.
 */
export function showStatus(): void {
  const pid = readPid();
  if (pid === null) {
    console.log("Klaus is not running.");
    return;
  }

  if (isProcessRunning(pid)) {
    console.log(`Klaus is running (PID ${pid}).`);
    console.log(`Log: ${LOG_FILE}`);
  } else {
    console.log(`Klaus is not running (stale PID ${pid}). Cleaning up.`);
    removePid();
  }
}

/**
 * Tail the daemon log file (like `tail -f`).
 */
export function tailLogs(): void {
  if (!existsSync(LOG_FILE)) {
    console.log("No log file found. Is Klaus running?");
    process.exit(1);
  }

  const tail = spawn("tail", ["-f", LOG_FILE], {
    stdio: ["ignore", "inherit", "inherit"],
  });

  tail.on("error", (err) => {
    console.error("Failed to tail logs:", err.message);
    process.exit(1);
  });

  process.once("SIGINT", () => {
    tail.kill("SIGINT");
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    tail.kill("SIGTERM");
    process.exit(0);
  });

  tail.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

// ---------------------------------------------------------------------------
// Log rotation
// ---------------------------------------------------------------------------

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_BACKUPS = 3;

/**
 * Rotate klaus.log if it exceeds MAX_LOG_SIZE.
 * Keeps up to MAX_LOG_BACKUPS old files (klaus.log.1, klaus.log.2, ...).
 */
function rotateLogs(): void {
  try {
    if (!existsSync(LOG_FILE)) return;
    const stat = statSync(LOG_FILE);
    if (stat.size < MAX_LOG_SIZE) return;

    // Shift existing backups: .2→.3, .1→.2
    for (let i = MAX_LOG_BACKUPS - 1; i >= 1; i--) {
      const from = `${LOG_FILE}.${i}`;
      const to = `${LOG_FILE}.${i + 1}`;
      if (existsSync(from)) {
        if (i + 1 > MAX_LOG_BACKUPS) {
          unlinkSync(from);
        } else {
          renameSync(from, to);
        }
      }
    }
    // Current → .1
    renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch {
    // Non-fatal: if rotation fails, just keep writing to the same file
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Reconstruct script args for re-spawn: [scriptPath, "start"] */
function getScriptArgs(): string[] {
  const scriptPath = process.argv[1];
  if (scriptPath.endsWith(".ts")) {
    console.error(
      "Daemon mode is not supported in dev (tsx). Use --foreground (-f) instead.",
    );
    process.exit(1);
  }
  return [scriptPath, "start"];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// launchd integration (macOS only)
// ---------------------------------------------------------------------------

const LAUNCHD_LABEL = "ai.klaus.daemon";
const LAUNCHD_DIR = join(homedir(), "Library", "LaunchAgents");
const LAUNCHD_PLIST = join(LAUNCHD_DIR, `${LAUNCHD_LABEL}.plist`);

function findKlausBinary(): string | null {
  // 1. If running from built dist, use the script path directly
  const scriptPath = process.argv[1];
  if (scriptPath && !scriptPath.endsWith(".ts") && existsSync(scriptPath)) {
    return scriptPath;
  }
  // 2. Try common global install locations
  const candidates = [
    join(homedir(), ".npm-global", "bin", "klaus"),
    "/usr/local/bin/klaus",
    "/opt/homebrew/bin/klaus",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function buildPlist(binPath: string, port: number): string {
  const logPath = LOG_FILE;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${binPath}</string>
    <string>start</string>
    <string>--foreground</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>${homedir()}</string>
    <key>KLAUS_WEB_PORT</key>
    <string>${port}</string>
  </dict>
</dict>
</plist>`;
}

/**
 * Install a launchd plist so Klaus starts automatically on login.
 */
export function installLaunchAgent(port = 3000): void {
  if (process.platform !== "darwin") {
    console.error("launchd is only available on macOS.");
    process.exit(1);
  }

  const binPath = findKlausBinary();
  if (!binPath) {
    console.error(
      "Could not find the klaus binary.",
    );
    process.exit(1);
  }

  mkdirSync(LAUNCHD_DIR, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });

  const plist = buildPlist(binPath, port);
  writeFileSync(LAUNCHD_PLIST, plist, "utf-8");

  // Load the agent
  try {
    // Unload first (ignore errors if not loaded)
    try {
      execFileSync("launchctl", ["unload", LAUNCHD_PLIST], { stdio: "ignore" });
    } catch {
      /* ok */
    }
    execFileSync("launchctl", ["load", LAUNCHD_PLIST], { stdio: "inherit" });
  } catch {
    console.error(
      "Failed to load launchd agent. You may need to load it manually:",
    );
    console.error(`  launchctl load "${LAUNCHD_PLIST}"`);
  }

  console.log(`Installed launchd agent: ${LAUNCHD_LABEL}`);
  console.log(`Plist: ${LAUNCHD_PLIST}`);
  console.log(`Klaus will start automatically on login (port ${port}).`);
}

/**
 * Uninstall the launchd plist.
 */
export function uninstallLaunchAgent(): void {
  if (process.platform !== "darwin") {
    console.error("launchd is only available on macOS.");
    process.exit(1);
  }

  if (!existsSync(LAUNCHD_PLIST)) {
    console.log("No launchd agent installed.");
    return;
  }

  try {
    execFileSync("launchctl", ["unload", LAUNCHD_PLIST], { stdio: "ignore" });
  } catch {
    /* ok if not loaded */
  }

  unlinkSync(LAUNCHD_PLIST);
  console.log(`Uninstalled launchd agent: ${LAUNCHD_LABEL}`);
}

/**
 * Machine-readable status output for the macOS app.
 */
export function showStatusJson(): void {
  const pid = readPid();
  const running = pid !== null && isProcessRunning(pid);

  // Clean up stale PID
  if (pid !== null && !running) {
    removePid();
  }

  const status = {
    running,
    pid: running ? pid : null,
    logFile: LOG_FILE,
    pidFile: PID_FILE,
    configDir: CONFIG_DIR,
    launchAgent: existsSync(LAUNCHD_PLIST) ? LAUNCHD_PLIST : null,
    version: getVersion(),
  };

  console.log(JSON.stringify(status));
}

function getVersion(): string {
  try {
    const pkgPath = join(__dirname, "..", "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      return pkg.version ?? "unknown";
    }
  } catch {
    /* ignore */
  }
  return "unknown";
}
