export type GatewayAttemptStatus =
  | "idle"
  | "running"
  | "streaming"
  | "tool_running"
  | "completed"
  | "error";

export type GatewayAttemptSnapshot = {
  readonly attemptId: string;
  readonly sequence: number;
  readonly status: Exclude<GatewayAttemptStatus, "idle">;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly finishedAt?: number;
  readonly textChunks: number;
  readonly thinkingChunks: number;
  readonly toolCalls: number;
  readonly lastToolName?: string;
  readonly error?: string;
};

export type GatewayAttemptLifecycleEvent =
  | {
      readonly type: "attempt_started";
      readonly sessionKey: string;
      readonly userId: string;
      readonly sessionId: string;
      readonly attempt: GatewayAttemptSnapshot;
    }
  | {
      readonly type: "attempt_progress";
      readonly sessionKey: string;
      readonly userId: string;
      readonly sessionId: string;
      readonly attempt: GatewayAttemptSnapshot;
      readonly previousStatus: "running" | "streaming" | "tool_running";
    }
  | {
      readonly type: "attempt_completed";
      readonly sessionKey: string;
      readonly userId: string;
      readonly sessionId: string;
      readonly attempt: GatewayAttemptSnapshot;
    }
  | {
      readonly type: "attempt_failed";
      readonly sessionKey: string;
      readonly userId: string;
      readonly sessionId: string;
      readonly attempt: GatewayAttemptSnapshot;
      readonly error: string;
    };

export type GatewaySessionRuntimeSnapshot = {
  readonly sessionKey: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly status: GatewayAttemptStatus;
  readonly updatedAt: number;
  readonly lastStartedAt?: number;
  readonly lastFinishedAt?: number;
  readonly activeAttempt?: GatewayAttemptSnapshot;
  readonly lastAttempt?: GatewayAttemptSnapshot;
  readonly recentAttempts: readonly GatewayAttemptSnapshot[];
};

export type GatewaySessionAttemptHistory = {
  readonly sessionKey: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly attempts: readonly GatewayAttemptSnapshot[];
};

export type GatewaySessionRuntimeUpdate = {
  readonly runtime: GatewaySessionRuntimeSnapshot;
  readonly lifecycle?: GatewayAttemptLifecycleEvent;
};

type MutableAttemptSnapshot = {
  -readonly [K in keyof GatewayAttemptSnapshot]: GatewayAttemptSnapshot[K];
};

type MutableSessionRuntimeBase = {
  -readonly [K in keyof Omit<
    GatewaySessionRuntimeSnapshot,
    "activeAttempt" | "lastAttempt" | "recentAttempts"
  >]: Omit<GatewaySessionRuntimeSnapshot, "activeAttempt" | "lastAttempt" | "recentAttempts">[K];
};

type MutableSessionRuntimeSnapshot = MutableSessionRuntimeBase & {
  activeAttempt?: MutableAttemptSnapshot;
  lastAttempt?: MutableAttemptSnapshot;
  recentAttempts: MutableAttemptSnapshot[];
};

const MAX_RECENT_ATTEMPTS = 20;
const MAX_SESSIONS = 200;
const SESSION_TTL_MS = 30 * 60 * 1000;

export class GatewaySessionRuntimeRegistry {
  private readonly sessions = new Map<string, MutableSessionRuntimeSnapshot>();

  private prune(): void {
    const now = Date.now();
    for (const [key, runtime] of this.sessions) {
      if (
        !runtime.activeAttempt &&
        runtime.lastFinishedAt &&
        now - runtime.lastFinishedAt > SESSION_TTL_MS
      ) {
        this.sessions.delete(key);
      }
    }
    while (this.sessions.size > MAX_SESSIONS) {
      let oldestKey: string | undefined;
      let oldestTime = Infinity;
      for (const [key, runtime] of this.sessions) {
        if (runtime.activeAttempt) continue;
        const t = runtime.lastFinishedAt ?? runtime.updatedAt;
        if (t < oldestTime) {
          oldestTime = t;
          oldestKey = key;
        }
      }
      if (!oldestKey) break;
      this.sessions.delete(oldestKey);
    }
  }

  startAttempt(params: {
    sessionKey: string;
    userId: string;
    sessionId: string;
  }): GatewaySessionRuntimeUpdate {
    const now = Date.now();
    const current = this.sessions.get(params.sessionKey);
    const sequence = current?.lastAttempt
      ? current.lastAttempt.sequence + 1
      : current?.activeAttempt
        ? current.activeAttempt.sequence + 1
        : 1;
    const activeAttempt: MutableAttemptSnapshot = {
      attemptId: `${params.sessionId}-${now.toString(36)}`,
      sequence,
      status: "running",
      startedAt: now,
      updatedAt: now,
      textChunks: 0,
      thinkingChunks: 0,
      toolCalls: 0,
    };
    const runtime: MutableSessionRuntimeSnapshot = {
      sessionKey: params.sessionKey,
      userId: params.userId,
      sessionId: params.sessionId,
      status: "running",
      updatedAt: now,
      lastStartedAt: now,
      ...(current?.lastFinishedAt ? { lastFinishedAt: current.lastFinishedAt } : {}),
      ...(current?.lastAttempt ? { lastAttempt: current.lastAttempt } : {}),
      recentAttempts: current?.recentAttempts ? [...current.recentAttempts] : [],
      activeAttempt,
    };
    this.sessions.set(params.sessionKey, runtime);
    this.prune();
    const snapshot = this.snapshot(runtime);
    return {
      runtime: snapshot,
      lifecycle: this.buildLifecycle(snapshot, "attempt_started"),
    };
  }

  recordText(sessionKey: string): GatewaySessionRuntimeUpdate | null {
    return this.mutateActiveAttempt(sessionKey, (runtime, previousStatus) => {
      runtime.status = "streaming";
      runtime.updatedAt = Date.now();
      runtime.activeAttempt!.status = "streaming";
      runtime.activeAttempt!.updatedAt = runtime.updatedAt;
      runtime.activeAttempt!.textChunks += 1;
      return previousStatus !== "streaming"
        ? { type: "attempt_progress", previousStatus }
        : null;
    });
  }

  recordThinking(sessionKey: string): GatewaySessionRuntimeUpdate | null {
    return this.mutateActiveAttempt(sessionKey, (runtime, previousStatus) => {
      runtime.status = "streaming";
      runtime.updatedAt = Date.now();
      runtime.activeAttempt!.status = "streaming";
      runtime.activeAttempt!.updatedAt = runtime.updatedAt;
      runtime.activeAttempt!.thinkingChunks += 1;
      return previousStatus !== "streaming"
        ? { type: "attempt_progress", previousStatus }
        : null;
    });
  }

  recordToolStart(
    sessionKey: string,
    toolName: string,
  ): GatewaySessionRuntimeUpdate | null {
    return this.mutateActiveAttempt(sessionKey, (runtime, previousStatus) => {
      const shouldEmit =
        previousStatus !== "tool_running" ||
        runtime.activeAttempt!.lastToolName !== toolName;
      runtime.status = "tool_running";
      runtime.updatedAt = Date.now();
      runtime.activeAttempt!.status = "tool_running";
      runtime.activeAttempt!.updatedAt = runtime.updatedAt;
      runtime.activeAttempt!.toolCalls += 1;
      runtime.activeAttempt!.lastToolName = toolName;
      return shouldEmit ? { type: "attempt_progress", previousStatus } : null;
    });
  }

  recordToolEnd(sessionKey: string): GatewaySessionRuntimeUpdate | null {
    return this.mutateActiveAttempt(sessionKey, (runtime, previousStatus) => {
      runtime.status = "running";
      runtime.updatedAt = Date.now();
      runtime.activeAttempt!.status = "running";
      runtime.activeAttempt!.updatedAt = runtime.updatedAt;
      return previousStatus !== "running"
        ? { type: "attempt_progress", previousStatus }
        : null;
    });
  }

  completeAttempt(sessionKey: string): GatewaySessionRuntimeUpdate | null {
    return this.finishAttempt(sessionKey, "completed");
  }

  failAttempt(
    sessionKey: string,
    error: string,
  ): GatewaySessionRuntimeUpdate | null {
    return this.finishAttempt(sessionKey, "error", error);
  }

  get(sessionKey: string): GatewaySessionRuntimeSnapshot | null {
    const runtime = this.sessions.get(sessionKey);
    return runtime ? this.snapshot(runtime) : null;
  }

  list(params?: {
    userId?: string;
  }): readonly GatewaySessionRuntimeSnapshot[] {
    return [...this.sessions.values()]
      .filter((runtime) => !params?.userId || runtime.userId === params.userId)
      .map((runtime) => this.snapshot(runtime));
  }

  getAttempts(sessionKey: string): readonly GatewayAttemptSnapshot[] {
    const runtime = this.sessions.get(sessionKey);
    return runtime ? runtime.recentAttempts.map((attempt) => ({ ...attempt })) : [];
  }

  listAttemptHistories(params?: {
    userId?: string;
  }): readonly GatewaySessionAttemptHistory[] {
    return [...this.sessions.values()]
      .filter((runtime) => !params?.userId || runtime.userId === params.userId)
      .map((runtime) => ({
        sessionKey: runtime.sessionKey,
        userId: runtime.userId,
        sessionId: runtime.sessionId,
        attempts: runtime.recentAttempts.map((attempt) => ({ ...attempt })),
      }));
  }

  private mutateActiveAttempt(
    sessionKey: string,
    updater: (
      runtime: MutableSessionRuntimeSnapshot,
      previousStatus: "running" | "streaming" | "tool_running",
    ) => { type: "attempt_progress"; previousStatus: "running" | "streaming" | "tool_running" } | null,
  ): GatewaySessionRuntimeUpdate | null {
    const runtime = this.sessions.get(sessionKey);
    if (!runtime?.activeAttempt) {
      return null;
    }
    const previousStatus = runtime.activeAttempt.status as "running" | "streaming" | "tool_running";
    const lifecycle = updater(runtime, previousStatus);
    const snapshot = this.snapshot(runtime);
    return {
      runtime: snapshot,
      ...(lifecycle ? { lifecycle: this.buildLifecycle(snapshot, lifecycle.type, lifecycle.previousStatus) } : {}),
    };
  }

  private finishAttempt(
    sessionKey: string,
    status: "completed" | "error",
    error?: string,
  ): GatewaySessionRuntimeUpdate | null {
    const runtime = this.sessions.get(sessionKey);
    if (!runtime || !runtime.activeAttempt) {
      return runtime ? { runtime: this.snapshot(runtime) } : null;
    }
    const now = Date.now();
    runtime.status = status;
    runtime.updatedAt = now;
    runtime.lastFinishedAt = now;
    runtime.activeAttempt.status = status;
    runtime.activeAttempt.updatedAt = now;
    runtime.activeAttempt.finishedAt = now;
    if (error) {
      runtime.activeAttempt.error = error;
    }
    runtime.lastAttempt = { ...runtime.activeAttempt };
    runtime.recentAttempts = [
      ...runtime.recentAttempts,
      { ...runtime.activeAttempt },
    ].slice(-MAX_RECENT_ATTEMPTS);
    delete runtime.activeAttempt;
    const snapshot = this.snapshot(runtime);
    return {
      runtime: snapshot,
      lifecycle: this.buildLifecycle(
        snapshot,
        status === "completed" ? "attempt_completed" : "attempt_failed",
        undefined,
        error,
      ),
    };
  }

  private buildLifecycle(
    snapshot: GatewaySessionRuntimeSnapshot,
    type: GatewayAttemptLifecycleEvent["type"],
    previousStatus?: "running" | "streaming" | "tool_running",
    error?: string,
  ): GatewayAttemptLifecycleEvent {
    const attempt = snapshot.activeAttempt ?? snapshot.lastAttempt;
    if (!attempt) {
      throw new Error("attempt lifecycle requested without attempt snapshot");
    }
    if (type === "attempt_progress") {
      return {
        type,
        sessionKey: snapshot.sessionKey,
        userId: snapshot.userId,
        sessionId: snapshot.sessionId,
        attempt,
        previousStatus: previousStatus ?? "running",
      };
    }
    if (type === "attempt_failed") {
      return {
        type,
        sessionKey: snapshot.sessionKey,
        userId: snapshot.userId,
        sessionId: snapshot.sessionId,
        attempt,
        error: error ?? attempt.error ?? "unknown error",
      };
    }
    return {
      type,
      sessionKey: snapshot.sessionKey,
      userId: snapshot.userId,
      sessionId: snapshot.sessionId,
      attempt,
    };
  }

  private snapshot(
    runtime: MutableSessionRuntimeSnapshot,
  ): GatewaySessionRuntimeSnapshot {
    return {
      sessionKey: runtime.sessionKey,
      userId: runtime.userId,
      sessionId: runtime.sessionId,
      status: runtime.status,
      updatedAt: runtime.updatedAt,
      recentAttempts: runtime.recentAttempts.map((attempt) => ({ ...attempt })),
      ...(runtime.lastStartedAt ? { lastStartedAt: runtime.lastStartedAt } : {}),
      ...(runtime.lastFinishedAt ? { lastFinishedAt: runtime.lastFinishedAt } : {}),
      ...(runtime.activeAttempt
        ? { activeAttempt: { ...runtime.activeAttempt } }
        : {}),
      ...(runtime.lastAttempt
        ? { lastAttempt: { ...runtime.lastAttempt } }
        : {}),
    };
  }
}
