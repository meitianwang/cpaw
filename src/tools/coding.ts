/**
 * Built-in coding tools — read, write, edit, exec.
 * Lets the LLM operate on the filesystem and run commands.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult, ToolExecutionContext } from "klaus-agent";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, isAbsolute } from "node:path";
import { spawn } from "node:child_process";
import { loadSandboxConfig, sandboxExec } from "../sandbox.js";
import type { SettingsStore } from "../settings-store.js";

function textResult(text: string): AgentToolResult {
  return { content: [{ type: "text", text }] };
}

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

const ReadParams = Type.Object({
  path: Type.String({ description: "Absolute or relative file path to read." }),
  offset: Type.Optional(Type.Number({ description: "Start line (1-indexed). Default 1." })),
  limit: Type.Optional(Type.Number({ description: "Max lines to return. Default 2000." })),
});
type ReadParams = Static<typeof ReadParams>;

const MAX_READ_LINES = 2000;
const MAX_READ_BYTES = 51200; // 50 KB

function createReadTool(workdir: string): AgentTool {
  return {
    name: "read",
    label: "Read File",
    description:
      "Read file contents. Output is truncated to 2000 lines or 50 KB. " +
      "Use offset/limit to page through large files.",
    parameters: ReadParams,
    async execute(_id, params: ReadParams, ctx: ToolExecutionContext): Promise<AgentToolResult> {
      const filePath = toAbsolute(params.path, workdir);
      const raw = await readFile(filePath, "utf-8");
      const lines = raw.split("\n");
      const offset = Math.max((params.offset ?? 1) - 1, 0);
      const limit = params.limit ?? MAX_READ_LINES;
      const slice = lines.slice(offset, offset + limit);

      let text = slice.map((line, i) => `${offset + i + 1}\t${line}`).join("\n");
      if (text.length > MAX_READ_BYTES) {
        text = text.slice(0, MAX_READ_BYTES) + "\n... (truncated)";
      }

      const totalLines = lines.length;
      const shown = slice.length;
      const remaining = totalLines - offset - shown;
      if (remaining > 0) {
        text += `\n\n[${remaining} more lines. Use offset=${offset + shown + 1} to continue.]`;
      }
      return textResult(text);
    },
  };
}

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------

const WriteParams = Type.Object({
  path: Type.String({ description: "Absolute or relative file path to write." }),
  content: Type.String({ description: "Full content to write to the file." }),
});
type WriteParams = Static<typeof WriteParams>;

function createWriteTool(workdir: string): AgentTool {
  return {
    name: "write",
    label: "Write File",
    description:
      "Write content to a file. Creates the file and parent directories if they don't exist. " +
      "Overwrites existing content.",
    parameters: WriteParams,
    async execute(_id, params: WriteParams): Promise<AgentToolResult> {
      const filePath = toAbsolute(params.path, workdir);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, params.content, "utf-8");
      return textResult(`Wrote ${params.content.length} bytes to ${filePath}`);
    },
  };
}

// ---------------------------------------------------------------------------
// edit
// ---------------------------------------------------------------------------

const EditParams = Type.Object({
  path: Type.String({ description: "Absolute or relative file path to edit." }),
  old_text: Type.String({ description: "Exact text to find (must match exactly including whitespace)." }),
  new_text: Type.String({ description: "Replacement text." }),
});
type EditParams = Static<typeof EditParams>;

function createEditTool(workdir: string): AgentTool {
  return {
    name: "edit",
    label: "Edit File",
    description:
      "Edit a file by replacing exact text. old_text must match exactly (including whitespace and indentation). " +
      "Fails if old_text is not found or matches multiple locations. " +
      "For creating new files, use the write tool instead.",
    parameters: EditParams,
    async execute(_id, params: EditParams): Promise<AgentToolResult> {
      const filePath = toAbsolute(params.path, workdir);
      const content = await readFile(filePath, "utf-8");

      const count = countOccurrences(content, params.old_text);
      if (count === 0) {
        return textResult(`Error: old_text not found in ${filePath}`);
      }
      if (count > 1) {
        return textResult(`Error: old_text matches ${count} locations in ${filePath}. Provide more context to make it unique.`);
      }

      const updated = content.replace(params.old_text, params.new_text);
      await writeFile(filePath, updated, "utf-8");
      return textResult(`Edited ${filePath}`);
    },
  };
}

function countOccurrences(text: string, sub: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(sub, pos)) !== -1) {
    count++;
    pos += sub.length;
  }
  return count;
}

// ---------------------------------------------------------------------------
// exec
// ---------------------------------------------------------------------------

const ExecParams = Type.Object({
  command: Type.String({ description: "Shell command to execute." }),
  workdir: Type.Optional(Type.String({ description: "Working directory. Defaults to project root." })),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds. Default 30." })),
});
type ExecParams = Static<typeof ExecParams>;

const DEFAULT_EXEC_TIMEOUT = 30;
const MAX_OUTPUT = 8192;

function createExecTool(workdir: string, store: SettingsStore): AgentTool {
  return {
    name: "exec",
    label: "Execute Command",
    description:
      "Execute a shell command and return stdout/stderr. " +
      "When sandbox is enabled, runs inside a Docker container. " +
      "Output is truncated to 8 KB per stream.",
    parameters: ExecParams,
    async execute(_id, params: ExecParams, ctx: ToolExecutionContext): Promise<AgentToolResult> {
      const sandboxConfig = loadSandboxConfig(store);
      const timeout = params.timeout ?? DEFAULT_EXEC_TIMEOUT;

      // Sandbox mode: run in Docker container
      if (sandboxConfig.enabled) {
        const result = await sandboxExec(
          { ...sandboxConfig, timeout },
          params.command,
        );
        return textResult(formatExecResult(result.stdout, result.stderr, result.exitCode, result.timedOut));
      }

      // Host mode: only allowed when explicitly enabled
      if (!store.getBool("coding_tools.host_exec", false)) {
        return textResult("Error: host execution is disabled. Enable sandbox (sandbox.enabled=true) or set coding_tools.host_exec=true in settings.");
      }
      const cwd = params.workdir ? toAbsolute(params.workdir, workdir) : workdir;
      const result = await hostExec(params.command, cwd, timeout, ctx.signal);
      return textResult(formatExecResult(result.stdout, result.stderr, result.exitCode, result.timedOut));
    },
  };
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

function hostExec(command: string, cwd: string, timeoutSec: number, signal: AbortSignal): Promise<ExecResult> {
  return new Promise((done, reject) => {
    const child = spawn("sh", ["-c", command], { cwd, stdio: ["ignore", "pipe", "pipe"] });

    child.on("error", (err) => {
      reject(new Error(`Failed to execute command: ${err.message}`));
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutLen < MAX_OUTPUT) { stdoutChunks.push(chunk); stdoutLen += chunk.length; }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrLen < MAX_OUTPUT) { stderrChunks.push(chunk); stderrLen += chunk.length; }
    });

    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutSec * 1000);

    const onAbort = () => { child.kill("SIGKILL"); };
    signal.addEventListener("abort", onAbort, { once: true });

    child.on("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      done({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8").slice(0, MAX_OUTPUT),
        stderr: Buffer.concat(stderrChunks).toString("utf-8").slice(0, MAX_OUTPUT),
        exitCode: code ?? 1,
        timedOut,
      });
    });
  });
}

function formatExecResult(stdout: string, stderr: string, exitCode: number, timedOut: boolean): string {
  const parts: string[] = [];
  if (timedOut) parts.push("[TIMED OUT]");
  if (exitCode !== 0) parts.push(`[exit code: ${exitCode}]`);
  if (stdout) parts.push(stdout);
  if (stderr) parts.push(`[stderr]\n${stderr}`);
  return parts.join("\n") || "(no output)";
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function toAbsolute(p: string, workdir: string): string {
  const resolved = resolve(workdir, p);
  if (resolved !== workdir && !resolved.startsWith(workdir + "/")) {
    throw new Error(`Path "${p}" escapes workspace boundary`);
  }
  return resolved;
}

/**
 * Create all four coding tools.
 */
export function createCodingTools(workdir: string, store: SettingsStore): AgentTool[] {
  return [
    createReadTool(workdir),
    createWriteTool(workdir),
    createEditTool(workdir),
    createExecTool(workdir, store),
  ];
}
