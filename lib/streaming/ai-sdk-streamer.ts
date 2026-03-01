import { ToolLoopAgent, type ModelMessage, pruneMessages, stepCountIs } from "ai";
import { Sandbox } from "@e2b/desktop";
import {
  ComputerInteractionStreamerFacade,
  ComputerInteractionStreamerFacadeStreamProps,
  createStreamingResponse,
} from "@/lib/streaming";
import { ResolutionScaler } from "@/lib/streaming/resolution";
import { createE2BComputerTool, COMPUTER_USE_INSTRUCTIONS, ComputerToolContext } from "@/lib/tools/computer-tool";
import { createBashTool } from "@/lib/tools/bash-tool";
import { createProviderInstance, ProviderConfig, getProviderCapabilities, validateProviderConfig } from "@/lib/providers";
import { SSEEventType, SSEEvent } from "@/types/api";
import type { ComputerAction } from "@/types/anthropic";
import { logError } from "@/lib/logger";

type StreamChunk = { type: string; [key: string]: unknown };

class ToolLoopSSEAdapter {
  *mapChunkToSSE(chunk: StreamChunk): Generator<SSEEvent> {
    if (chunk.type === "text-delta") {
      yield { type: SSEEventType.REASONING, content: String(chunk.text ?? "") };
      return;
    }

    if (chunk.type === "tool-call") {
      const toolCall = chunk as { input?: Record<string, unknown> };
      yield {
        type: SSEEventType.ACTION,
        action: (toolCall.input || {}) as unknown as ComputerAction,
      };
      return;
    }

    if (chunk.type === "tool-result") {
      const toolResult = chunk as { isError?: boolean; error?: unknown };
      if (!toolResult.isError && !toolResult.error) {
        yield { type: SSEEventType.ACTION_COMPLETED };
      }
      return;
    }

    if (chunk.type === "error") {
      const errorChunk = chunk as { error?: { message?: string } | string };
      yield {
        type: SSEEventType.ERROR,
        content: typeof errorChunk.error === "string" ? errorChunk.error : errorChunk.error?.message || "An error occurred",
      };
      return;
    }

    if (chunk.type === "finish") {
      yield { type: SSEEventType.DONE };
    }
  }
}

export class AISDKComputerStreamer implements ComputerInteractionStreamerFacade {
  public instructions: string;
  public desktop: Sandbox;
  public resolutionScaler: ResolutionScaler;
  private providerConfig: ProviderConfig;

  constructor(desktop: Sandbox, resolutionScaler: ResolutionScaler, providerConfig: ProviderConfig) {
    this.desktop = desktop;
    this.resolutionScaler = resolutionScaler;
    this.providerConfig = providerConfig;
    this.instructions = COMPUTER_USE_INSTRUCTIONS;
  }

  async executeAction(_action: unknown): Promise<void> {}

  async *stream(props: ComputerInteractionStreamerFacadeStreamProps): AsyncGenerator<SSEEvent> {
    const { messages, signal } = props;

    try {
      const validationError = validateProviderConfig(this.providerConfig);
      if (validationError) {
        throw new Error(validationError);
      }

      const model = createProviderInstance(this.providerConfig);
      const toolContext: ComputerToolContext = { desktop: this.desktop, resolutionScaler: this.resolutionScaler };
      const capabilities = getProviderCapabilities(this.providerConfig.type, this.providerConfig.model);

      if (capabilities.hasNativeComputerUse && this.providerConfig.useNativeComputerUse) {
        yield* this.streamNativeComputerUse(messages, signal);
        return;
      }

      const agent = new ToolLoopAgent({
        model,
        instructions: `${this.instructions}\n\nScreen resolution: ${this.resolutionScaler.getScaledResolution().join("x")}`,
        stopWhen: stepCountIs(50),
        tools: {
          computer: createE2BComputerTool(toolContext, this.resolutionScaler.getScaledResolution()),
          bash: createBashTool(this.desktop),
        },
        prepareStep: async ({ messages: stepMessages }) => {
          const screenshot = await this.resolutionScaler.takeScreenshot();
          const injectedMessage: ModelMessage = {
            role: "user",
            content: [
              { type: "image", image: Buffer.from(screenshot) },
              { type: "text", text: "Current desktop state after the last action." },
            ],
          };

          const nextMessages = pruneMessages({
            messages: [...stepMessages, injectedMessage],
            toolCalls: "before-last-4-messages",
            reasoning: "before-last-message",
            emptyMessages: "remove",
          });

          return { messages: nextMessages };
        },
      });

      const result = await agent.stream({ messages, abortSignal: signal });
      const sseAdapter = new ToolLoopSSEAdapter();

      for await (const chunk of result.fullStream) {
        if (signal.aborted) {
          yield { type: SSEEventType.DONE, content: "Generation stopped by user" };
          return;
        }

        for (const event of sseAdapter.mapChunkToSSE(chunk)) {
          if (signal.aborted) {
            yield { type: SSEEventType.DONE, content: "Generation stopped by user" };
            return;
          }

          yield event;
          if (event.type === SSEEventType.DONE) {
            return;
          }
        }
      }
    } catch (error) {
      logError("AI_SDK_STREAMER", error);
      yield {
        type: SSEEventType.ERROR,
        content: error instanceof Error ? error.message : "An error occurred with the AI service.",
      };
    }
  }

  private async *streamNativeComputerUse(messages: ModelMessage[], signal: AbortSignal): AsyncGenerator<SSEEvent> {
    const { OpenAIComputerStreamer } = await import("@/lib/streaming/openai");
    const { AnthropicComputerStreamer } = await import("@/lib/streaming/anthropic");

    let streamer: ComputerInteractionStreamerFacade;

    if (this.providerConfig.type === "openai") {
      streamer = new OpenAIComputerStreamer(this.desktop, this.resolutionScaler);
    } else if (this.providerConfig.type === "anthropic") {
      streamer = new AnthropicComputerStreamer(this.desktop, this.resolutionScaler);
    } else {
      const model = createProviderInstance(this.providerConfig);
      const agent = new ToolLoopAgent({
        model,
        instructions: this.instructions,
        stopWhen: stepCountIs(50),
        tools: { computer: createE2BComputerTool({ desktop: this.desktop, resolutionScaler: this.resolutionScaler }, this.resolutionScaler.getScaledResolution()) },
      });

      const result = await agent.stream({ messages, abortSignal: signal });
      const sseAdapter = new ToolLoopSSEAdapter();
      for await (const chunk of result.fullStream) {
        if (signal.aborted) {
          yield { type: SSEEventType.DONE, content: "Generation stopped by user" };
          return;
        }

        for (const event of sseAdapter.mapChunkToSSE(chunk)) {
          if (signal.aborted) {
            yield { type: SSEEventType.DONE, content: "Generation stopped by user" };
            return;
          }
          yield event;
        }
      }
      return;
    }

    yield* streamer.stream({ messages, signal });
  }
}

export function createAISDKStreamingResponse(
  desktop: Sandbox,
  resolutionScaler: ResolutionScaler,
  providerConfig: ProviderConfig,
  messages: ModelMessage[],
  signal: AbortSignal,
): Response {
  const streamer = new AISDKComputerStreamer(desktop, resolutionScaler, providerConfig);
  const generator = streamer.stream({ messages, signal });
  return createStreamingResponse(generator);
}

export { createStreamingResponse } from "@/lib/streaming";
