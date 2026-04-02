/**
 * Compatibility shim — types for legacy Klaus tools (memory, capabilities, providers).
 * These tools use the legacy execute() signature, not the engine's call() signature.
 */

// AgentTool: Klaus's own tool interface (used by memory, capabilities, etc.)
export interface AgentTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute(
    toolCallId: string,
    params: unknown,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult>;
}

export interface AgentToolResult {
  content: { type: string; text?: string }[];
  isError?: boolean;
}

export interface ToolExecutionContext {
  signal: AbortSignal;
  onUpdate: (...args: unknown[]) => void;
  approval: {
    isYolo(): boolean;
    request?(...args: unknown[]): Promise<boolean>;
    [key: string]: unknown;
  };
  agentName: string;
}

// Hook types (used by tool-loop-detector.ts, capabilities/types.ts, providers/types.ts)
export interface BeforeToolCallContext {
  toolName: string;
  args: unknown;
  toolCallId: string;
  sessionKey?: string;
}

export interface BeforeToolCallResult {
  block?: boolean;
  reason?: string;
}

export interface AfterToolCallContext {
  toolName: string;
  toolCallId: string;
  result?: unknown;
  error?: unknown;
}

export interface AfterToolCallResult {
  result?: unknown;
  error?: unknown;
}
