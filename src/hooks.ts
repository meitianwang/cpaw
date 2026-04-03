/**
 * Hooks system — follows claude-code's hook architecture.
 *
 * Supports command hooks (shell scripts) that run before/after tool execution.
 * Config format matches claude-code's settings.json hooks section:
 *
 * {
 *   "PreToolUse": [{ "matcher": "Write", "hooks": [{ "type": "command", "command": "..." }] }],
 *   "PostToolUse": [...],
 *   "Stop": [...]
 * }
 *
 * Command hooks receive JSON on stdin and may return JSON on stdout to affect behavior.
 */

import { spawn } from "node:child_process";

// ============================================================================
// Types (matching claude-code's schemas/hooks.ts)
// ============================================================================

export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "Stop"
  | "StopFailure"
  | "Notification"
  | "SessionStart"
  | "SubagentStop";

export interface CommandHook {
  type: "command";
  command: string;
  timeout?: number;
  if?: string;
}

export interface HookMatcher {
  matcher?: string;
  hooks: CommandHook[];
}

export type HooksConfig = Partial<Record<HookEvent, HookMatcher[]>>;

// ============================================================================
// Hook output (matches claude-code's HookJSONOutput)
// ============================================================================

export interface HookOutput {
  continue?: boolean;
  decision?: "approve" | "block";
  reason?: string;
  stopReason?: string;
  hookSpecificOutput?: {
    hookEventName?: string;
    updatedInput?: Record<string, unknown>;
    additionalContext?: string;
  };
}

// ============================================================================
// Pre/Post tool hook results
// ============================================================================

export interface PreToolHookResult {
  blocked: boolean;
  reason?: string;
  updatedInput?: Record<string, unknown>;
  additionalContexts: string[];
}

export interface PostToolHookResult {
  additionalContexts: string[];
}

// ============================================================================
// Matching
// ============================================================================

/** Glob-like match: "*" matches anything, "Bash(git *)" matches tool + args pattern. */
function matchesPattern(pattern: string, value: string): boolean {
  // Exact match
  if (pattern === value) return true;
  // Wildcard
  if (pattern === "*") return true;
  // Simple glob: convert * to .* for regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function getMatchingHooks(
  config: HooksConfig,
  event: HookEvent,
  matchQuery?: string,
): CommandHook[] {
  const matchers = config[event];
  if (!matchers) return [];

  const result: CommandHook[] = [];
  for (const m of matchers) {
    // No matcher = matches all
    if (!m.matcher || !matchQuery || matchesPattern(m.matcher, matchQuery)) {
      for (const hook of m.hooks) {
        if (hook.type === "command") {
          result.push(hook);
        }
      }
    }
  }
  return result;
}

// ============================================================================
// Command execution
// ============================================================================

const MAX_STDERR_BYTES = 8192;

function executeCommandHook(
  command: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
  timeoutMs = 30_000,
): Promise<HookOutput | null> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }

    const child = spawn(command, [], {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        console.warn(`[Hooks] Command timed out after ${timeoutMs}ms: ${command}`);
        resolve(null);
      }
    }, timeoutMs);

    const onAbort = () => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        clearTimeout(timer);
        resolve(null);
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr!.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR_BYTES) {
        stderr += chunk.toString().slice(0, MAX_STDERR_BYTES - stderr.length);
      }
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        console.error(`[Hooks] Command spawn error: ${err.message}`);
        resolve(null);
      }
    });

    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);

        if (stderr) {
          console.warn(`[Hooks] stderr from "${command}": ${stderr.slice(0, 200)}`);
        }

        if (code !== 0) {
          console.warn(`[Hooks] Command exited with code ${code}: ${command}`);
          // Non-zero exit = blocking error (tool should not proceed)
          resolve({ continue: false, reason: `Hook "${command}" failed (exit ${code}): ${stderr.slice(0, 200)}` });
          return;
        }

        // Parse JSON output
        const trimmed = stdout.trim();
        if (!trimmed) {
          resolve(null); // No output = success, continue
          return;
        }

        try {
          resolve(JSON.parse(trimmed) as HookOutput);
        } catch {
          console.warn(`[Hooks] Non-JSON output from "${command}": ${trimmed.slice(0, 100)}`);
          resolve(null);
        }
      }
    });

    // Write JSON input to stdin
    const jsonInput = JSON.stringify(input);
    child.stdin!.write(jsonInput + "\n", "utf8");
    child.stdin!.end();
  });
}

// ============================================================================
// Public API: execute hooks for tool events
// ============================================================================

export async function executePreToolHooks(
  config: HooksConfig,
  toolName: string,
  toolInput: Record<string, unknown>,
  toolUseId: string,
  signal?: AbortSignal,
): Promise<PreToolHookResult> {
  const hooks = getMatchingHooks(config, "PreToolUse", toolName);
  if (hooks.length === 0) {
    return { blocked: false, additionalContexts: [] };
  }

  const input = {
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: toolUseId,
  };

  const additionalContexts: string[] = [];
  let updatedInput: Record<string, unknown> | undefined;

  for (const hook of hooks) {
    const timeoutMs = (hook.timeout ?? 30) * 1000;
    const output = await executeCommandHook(hook.command, input, signal, timeoutMs);
    if (!output) continue;

    // Hook explicitly blocked
    if (output.continue === false || output.decision === "block") {
      return {
        blocked: true,
        reason: output.reason ?? output.stopReason ?? `Blocked by hook: ${hook.command}`,
        additionalContexts,
      };
    }

    // Collect additional context
    if (output.hookSpecificOutput?.additionalContext) {
      additionalContexts.push(output.hookSpecificOutput.additionalContext);
    }

    // Hook may modify input
    if (output.hookSpecificOutput?.updatedInput) {
      updatedInput = output.hookSpecificOutput.updatedInput;
    }
  }

  return { blocked: false, updatedInput, additionalContexts };
}

export async function executePostToolHooks(
  config: HooksConfig,
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResponse: unknown,
  toolUseId: string,
  signal?: AbortSignal,
): Promise<PostToolHookResult> {
  const hooks = getMatchingHooks(config, "PostToolUse", toolName);
  if (hooks.length === 0) {
    return { additionalContexts: [] };
  }

  const input = {
    hook_event_name: "PostToolUse",
    tool_name: toolName,
    tool_input: toolInput,
    tool_response: toolResponse,
    tool_use_id: toolUseId,
  };

  const additionalContexts: string[] = [];

  for (const hook of hooks) {
    const timeoutMs = (hook.timeout ?? 30) * 1000;
    const output = await executeCommandHook(hook.command, input, signal, timeoutMs);
    if (!output) continue;

    if (output.hookSpecificOutput?.additionalContext) {
      additionalContexts.push(output.hookSpecificOutput.additionalContext);
    }
  }

  return { additionalContexts };
}

/**
 * Execute Stop hooks as an async generator, yielding AggregatedHookResult for each hook.
 * Aligned with claude-code's executeStopHooks generator (hooks.ts:3639).
 *
 * Each hook can:
 * - Exit 0 with no output → success (no yield)
 * - Exit 0 with JSON `{ continue: false }` → preventContinuation
 * - Exit 2 → blocking error (model should fix and retry)
 * - Exit non-zero (not 2) → non-blocking error
 *
 * The caller (handleStopHooks in query/stopHooks.ts) consumes yields and
 * decides whether to inject blocking errors back into the conversation.
 */
export async function* executeStopHooks(
  config: HooksConfig,
  lastAssistantMessage?: string,
  stopHookActive = false,
  signal?: AbortSignal,
): AsyncGenerator<StopHookAggregatedResult> {
  const hooks = getMatchingHooks(config, "Stop");
  if (hooks.length === 0) {
    return;
  }

  const input: Record<string, unknown> = {
    hook_event_name: "Stop",
    stop_hook_active: stopHookActive,
    last_assistant_message: lastAssistantMessage,
  };

  // Execute hooks sequentially (matching claude-code's behavior for Stop hooks)
  for (const hook of hooks) {
    const startTime = Date.now();
    const timeoutMs = (hook.timeout ?? 30) * 1000;

    // Yield progress so handleStopHooks can track hook count and info
    yield {
      type: "progress" as const,
      command: hook.command,
    };

    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      const result = await executeCommandHookRaw(hook.command, input, signal, timeoutMs);
      stdout = result.stdout;
      stderr = result.stderr;
      exitCode = result.exitCode;
    } catch {
      // Spawn/timeout error — treat as non-blocking error
      const durationMs = Date.now() - startTime;
      yield {
        type: "attachment" as const,
        attachmentType: "hook_error_during_execution" as const,
        content: `Failed to execute hook: ${hook.command}`,
        hookName: "Stop",
        hookEvent: "Stop",
        command: hook.command,
        durationMs,
      };
      continue;
    }

    const durationMs = Date.now() - startTime;

    // Exit code 2 = blocking error (model should fix and retry)
    if (exitCode === 2) {
      yield {
        type: "blocking_error" as const,
        blockingError: stderr || `Hook "${hook.command}" returned exit code 2`,
        command: hook.command,
        durationMs,
      };
      continue;
    }

    // Non-zero exit (not 2) = non-blocking error
    if (exitCode !== 0) {
      yield {
        type: "attachment" as const,
        attachmentType: "hook_non_blocking_error" as const,
        hookName: "Stop",
        hookEvent: "Stop",
        stderr,
        stdout,
        exitCode,
        command: hook.command,
        durationMs,
      };
      continue;
    }

    // Exit 0 — parse JSON output
    const trimmed = stdout.trim();
    if (!trimmed) {
      // No output = success, continue execution
      yield {
        type: "attachment" as const,
        attachmentType: "hook_success" as const,
        content: "",
        hookName: "Stop",
        hookEvent: "Stop",
        stdout: "",
        stderr,
        exitCode: 0,
        command: hook.command,
        durationMs,
      };
      continue;
    }

    try {
      const output = JSON.parse(trimmed) as HookOutput;

      if (output.continue === false) {
        yield {
          type: "prevent_continuation" as const,
          stopReason: output.stopReason ?? output.reason ?? "Stop hook prevented continuation",
          command: hook.command,
          durationMs,
        };
        return; // Stop executing further hooks
      }

      // Success with output
      yield {
        type: "attachment" as const,
        attachmentType: "hook_success" as const,
        content: trimmed,
        hookName: "Stop",
        hookEvent: "Stop",
        stdout: trimmed,
        stderr,
        exitCode: 0,
        command: hook.command,
        durationMs,
      };
    } catch {
      // Non-JSON output — treat as success with output
      console.warn(`[Hooks] Non-JSON output from "${hook.command}": ${trimmed.slice(0, 100)}`);
      yield {
        type: "attachment" as const,
        attachmentType: "hook_success" as const,
        content: trimmed,
        hookName: "Stop",
        hookEvent: "Stop",
        stdout: trimmed,
        stderr,
        exitCode: 0,
        command: hook.command,
        durationMs,
      };
    }
  }
}

/**
 * Result type for the stop hooks generator.
 */
export type StopHookAggregatedResult =
  | { type: "progress"; command: string }
  | { type: "blocking_error"; blockingError: string; command: string; durationMs: number }
  | { type: "prevent_continuation"; stopReason: string; command: string; durationMs: number }
  | {
      type: "attachment"
      attachmentType: "hook_non_blocking_error"
      hookName: string
      hookEvent: string
      stderr: string
      stdout: string
      exitCode: number
      command: string
      durationMs: number
    }
  | {
      type: "attachment"
      attachmentType: "hook_error_during_execution"
      content: string
      hookName: string
      hookEvent: string
      command: string
      durationMs: number
    }
  | {
      type: "attachment"
      attachmentType: "hook_success"
      content: string
      hookName: string
      hookEvent: string
      stdout: string
      stderr: string
      exitCode: number
      command: string
      durationMs: number
    }

/**
 * Execute StopFailure hooks when the assistant stops due to an error (prompt-too-long,
 * image error, API error without recovery, etc.). Fire-and-forget — errors are swallowed.
 *
 * Aligned with claude-code hooks.ts:3594.
 */
export async function executeStopFailureHooks(
  config: HooksConfig,
  lastMessage: { message: { content: Array<{ type: string; text?: string }> }; error?: string; errorDetails?: string },
): Promise<void> {
  const hooks = getMatchingHooks(config, "StopFailure", lastMessage.error);
  if (hooks.length === 0) return;

  // Extract last assistant text
  const textBlocks = lastMessage.message.content.filter(b => b.type === 'text' && b.text);
  const lastAssistantText = textBlocks.length > 0
    ? textBlocks.map(b => b.text).join('\n').trim()
    : undefined;

  const input: Record<string, unknown> = {
    hook_event_name: "StopFailure",
    error: lastMessage.error ?? "unknown",
    error_details: lastMessage.errorDetails,
    last_assistant_message: lastAssistantText,
  };

  for (const hook of hooks) {
    const timeoutMs = (hook.timeout ?? 30) * 1000;
    try {
      await executeCommandHookRaw(hook.command, input, undefined, timeoutMs);
    } catch {
      // Failures are silent — this is notification, not critical path
    }
  }
}

/**
 * Raw command execution — returns stdout, stderr, exitCode instead of parsed HookOutput.
 * Used by executeStopHooks generator to handle exit codes explicitly.
 */
function executeCommandHookRaw(
  command: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
  timeoutMs = 30_000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve({ stdout: "", stderr: "", exitCode: -1 });
      return;
    }

    const child = spawn(command, [], {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        console.warn(`[Hooks] Command timed out after ${timeoutMs}ms: ${command}`);
        resolve({ stdout, stderr, exitCode: -1 });
      }
    }, timeoutMs);

    const onAbort = () => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: -1 });
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr!.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR_BYTES) {
        stderr += chunk.toString().slice(0, MAX_STDERR_BYTES - stderr.length);
      }
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(err);
      }
    });

    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      }
    });

    const jsonInput = JSON.stringify(input);
    child.stdin!.write(jsonInput + "\n", "utf8");
    child.stdin!.end();
  });
}
