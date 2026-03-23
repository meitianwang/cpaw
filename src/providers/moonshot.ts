/**
 * Moonshot LLM provider — OpenAI-compatible with native thinking support.
 *
 * Moonshot uses `thinking: { type: "enabled" | "disabled" }` instead of
 * OpenAI's `reasoning_effort`. When thinking is enabled, incompatible
 * `tool_choice` values are normalized to avoid API errors.
 */

import OpenAI from "openai";
import type {
  LLMProvider,
  LLMRequestOptions,
  AssistantMessageEvent,
  AssistantMessage,
  TokenUsage,
  ThinkingLevel,
  Message,
} from "klaus-agent";

type AssistantContentBlock = AssistantMessage["content"][number];

type MoonshotThinkingType = "enabled" | "disabled";

function mapThinkingType(level?: ThinkingLevel): MoonshotThinkingType | undefined {
  if (!level || level === "off") return undefined;
  return "enabled";
}

export class MoonshotProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey?: string, baseUrl?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.MOONSHOT_API_KEY,
      ...(baseUrl ? { baseURL: baseUrl } : { baseURL: "https://api.moonshot.ai/v1" }),
    });
  }

  async *stream(options: LLMRequestOptions): AsyncIterable<AssistantMessageEvent> {
    try {
      yield* this._streamOnce(options);
    } catch (err) {
      yield { type: "error", error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  private async *_streamOnce(options: LLMRequestOptions): AsyncIterable<AssistantMessageEvent> {
    const { model, systemPrompt, messages, tools, thinkingLevel, maxTokens, signal } = options;

    const thinkingType = mapThinkingType(thinkingLevel);

    // Build tool_choice — normalize when thinking is enabled
    let toolChoice: "auto" | "none" | undefined;
    if (tools?.length) {
      toolChoice = "auto";
    }

    const params: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => mapMessage(m)),
      ],
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: maxTokens ?? 8192,
      ...(tools?.length ? {
        tools: tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        })),
        tool_choice: toolChoice,
      } : {}),
      ...(thinkingType ? { thinking: { type: thinkingType } } : {}),
    };

    const contentBlocks: AssistantContentBlock[] = [];
    const toolCalls = new Map<number, { id: string; name: string; args: string }>();
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    const stream = await this.client.chat.completions.create(
      params as unknown as OpenAI.ChatCompletionCreateParamsStreaming,
      { signal },
    );

    for await (const chunk of stream) {
      const choice = (chunk as any).choices?.[0];

      if (choice?.delta) {
        const delta = choice.delta;

        if (delta.content) {
          if (contentBlocks.length === 0 || contentBlocks[contentBlocks.length - 1].type !== "text") {
            contentBlocks.push({ type: "text", text: "" });
          }
          const block = contentBlocks[contentBlocks.length - 1];
          if (block.type === "text") {
            block.text += delta.content;
          }
          yield { type: "text", text: delta.content };
        }

        // Moonshot thinking content
        if (delta.reasoning_content) {
          if (contentBlocks.length === 0 || contentBlocks[contentBlocks.length - 1].type !== "thinking") {
            contentBlocks.push({ type: "thinking", thinking: "" });
          }
          const block = contentBlocks[contentBlocks.length - 1];
          if (block.type === "thinking") {
            block.thinking += delta.reasoning_content;
          }
          yield { type: "thinking", thinking: delta.reasoning_content };
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCalls.has(idx)) {
              const id = tc.id ?? `call_${idx}`;
              const name = tc.function?.name ?? "";
              toolCalls.set(idx, { id, name, args: "" });
              contentBlocks.push({ type: "tool_call", id, name, input: {} });
              yield { type: "tool_call_start", id, name };
            }
            if (tc.function?.arguments) {
              const entry = toolCalls.get(idx)!;
              entry.args += tc.function.arguments;
              yield { type: "tool_call_delta", id: entry.id, input: tc.function.arguments };
            }
          }
        }
      }

      if ((chunk as any).usage) {
        const u = (chunk as any).usage;
        usage = {
          inputTokens: u.prompt_tokens,
          outputTokens: u.completion_tokens,
          totalTokens: u.total_tokens,
        };
      }
    }

    for (const [, entry] of toolCalls) {
      const block = contentBlocks.find((b) => b.type === "tool_call" && b.id === entry.id);
      if (block && block.type === "tool_call") {
        try {
          block.input = JSON.parse(entry.args || "{}");
        } catch {
          block.input = {};
        }
      }
    }

    const message: AssistantMessage = { role: "assistant", content: contentBlocks };
    yield { type: "done", message, usage };
  }
}

function mapMessage(m: Message): Record<string, unknown> {
  if (m.role === "user") {
    if (typeof m.content === "string") {
      return { role: "user", content: m.content };
    }
    const parts = m.content.map((block) => {
      if (block.type === "text") return { type: "text", text: block.text };
      if (block.type === "image") {
        if (block.source.type === "url") {
          return { type: "image_url", image_url: { url: block.source.url } };
        }
        return {
          type: "image_url",
          image_url: { url: `data:${block.source.mediaType};base64,${block.source.data}` },
        };
      }
      return { type: "text", text: JSON.stringify(block) };
    });
    return { role: "user", content: parts };
  }

  if (m.role === "assistant") {
    let text = "";
    const toolCalls: Record<string, unknown>[] = [];
    for (const b of m.content) {
      if (b.type === "text") text += b.text;
      else if (b.type === "tool_call") {
        toolCalls.push({
          id: b.id,
          type: "function",
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        });
      }
    }
    return {
      role: "assistant",
      content: text || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
  }

  // tool_result
  return {
    role: "tool",
    tool_call_id: m.toolCallId,
    content: typeof m.content === "string"
      ? m.content
      : m.content.map((b) => b.type === "text" ? b.text : JSON.stringify(b)).join("\n"),
  };
}
