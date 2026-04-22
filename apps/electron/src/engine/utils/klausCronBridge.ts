/**
 * Bridge between Claude Code engine cron tools and Klaus's CronScheduler + SettingsStore.
 *
 * The engine tools (CronCreate/Delete/List) were originally designed for the CLI,
 * writing to .claude/scheduled_tasks.json. In Klaus's server context, tasks are
 * stored in SQLite and managed by Klaus's CronScheduler. This module provides
 * the glue so the engine tools operate on Klaus's system instead.
 */

// Structural type — avoids a direct import of shared/types.ts from engine
// code, which would re-introduce the circular dep. Engine tools only need
// the surface area below; the main process passes in its full SettingsStore
// + CronScheduler (which satisfies structurally).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BridgeTask = any;

interface KlausCronStore {
  upsertTask(task: BridgeTask): void;
  listUserTasks(userId: string | null | undefined): BridgeTask[];
  deleteUserTask(userId: string, taskId: string): boolean;
  getBool(key: string, defaultValue: boolean): boolean;
}

interface KlausCronScheduler {
  addTask(task: BridgeTask): void;
  editTask(id: string, patch: Partial<BridgeTask>): boolean;
  removeTask(id: string): boolean;
}

let _store: KlausCronStore | null = null;
let _scheduler: KlausCronScheduler | null = null;

export function setKlausCronBridge(
  store: KlausCronStore,
  scheduler: KlausCronScheduler | null,
): void {
  _store = store;
  _scheduler = scheduler;
}

export function getKlausCronStore(): KlausCronStore | null {
  return _store;
}

export function getKlausCronScheduler(): KlausCronScheduler | null {
  return _scheduler;
}

export function isKlausCronAvailable(): boolean {
  return _store !== null;
}

/**
 * Resolve the userId the CronCreate/List/Delete tools should scope to.
 * Prefers the ALS-scoped value (multi-user web), falls back to a stable
 * "desktop" constant. Desktop never runs runWithUserScope, so without this
 * fallback every desktop call would error out with "No user context".
 */
export function resolveCronUserId(
  scopedUserId: string | null | undefined,
): string {
  return scopedUserId || "desktop";
}

// ---------------------------------------------------------------------------
// Session channel context — populated by Klaus's channel handler before
// engine.chat() runs; consumed by CronCreateTool to bind new tasks to the
// IM conversation the user is speaking in.
// ---------------------------------------------------------------------------

export interface SessionChannelContext {
  readonly channelId: string;
  readonly accountId?: string;
  readonly targetId: string;
  readonly chatType: "direct" | "group";
  readonly threadId?: string;
  /** Optional display name captured at bind time. */
  readonly senderLabel?: string;
}

// Keyed by sessionKey (the stable per-conversation id the handler passes to
// engine.chat). Cleared in the handler's finally, so a stale entry can only
// exist if the process crashes mid-turn — harmless, next turn overwrites.
const sessionChannelCtx = new Map<string, SessionChannelContext>();

export function setSessionChannelContext(
  sessionKey: string,
  ctx: SessionChannelContext,
): void {
  sessionChannelCtx.set(sessionKey, ctx);
}

export function getSessionChannelContext(
  sessionKey: string,
): SessionChannelContext | null {
  return sessionChannelCtx.get(sessionKey) ?? null;
}

export function clearSessionChannelContext(sessionKey: string): void {
  sessionChannelCtx.delete(sessionKey);
}
