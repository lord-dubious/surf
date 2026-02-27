/**
 * AI SDK-based streamer for computer use
 * 
 * This streamer uses the Vercel AI SDK's streamText function with tools
 * to provide a unified interface for all providers.
 */
import { streamText, generateText, StreamTextResult, type ModelMessage, stepCountIs } from "ai";
import { Sandbox } from "@e2b/desktop";
import { 
  ComputerInteractionStreamerFacade, 
  ComputerInteractionStreamerFacadeStreamProps,
  formatSSE,
  createStreamingResponse
} from "@/lib/streaming";
import { ResolutionScaler } from "@/lib/streaming/resolution";
import { createComputerTool, COMPUTER_USE_INSTRUCTIONS, ComputerToolContext } from "@/lib/tools/computer-tool";
import { createProviderInstance, ProviderConfig, getProviderCapabilities } from "@/lib/providers";
import { SSEEventType, SSEEvent } from "@/types/api";
import type { ComputerAction } from "@/types/anthropic";
import { logDebug, logError } from "@/lib/logger";

type ToolLoopStreamChunk = Awaited<ReturnType<StreamTextResult<Record<string, never>, never>["fullStream"][typeof Symbol.asyncIterator]["next"]>>["value"];

/**
 * Adapter for ToolLoopAgent-style callbacks/chunks -> Surf SSE contract consumed by chat-context.
 *
 * Mapping contract:
 * 1) Partial assistant text (`text-delta`) -> `SSEEventType.REASONING` with chunk text as-is.
 * 2) Tool invocation (`tool-call`) -> `SSEEventType.ACTION` with tool input as the `action` payload.
 * 3) Tool completion (`tool-result`) -> `SSEEventType.ACTION_COMPLETED` only after successful execute.
 * 4) Terminal (`finish`) -> `SSEEventType.DONE`, stream errors (`error`) -> `SSEEventType.ERROR`.
 */
class ToolLoopSSEAdapter {
  *mapChunkToSSE(chunk: ToolLoopStreamChunk): Generator<SSEEvent> {
    switch (chunk.type) {
      case "text-delta": {
        yield {
          type: SSEEventType.REASONING,
          content: chunk.text,
        };
        return;
      }

      case "tool-call": {
        const toolCall = chunk as {
          toolCallId: string;
          toolName: string;
          input: Record<string, unknown>;
        };

        yield {
          type: SSEEventType.ACTION,
          action: toolCall.input as unknown as ComputerAction,
        };
        return;
      }

      case "tool-result": {
        const toolResult = chunk as {
          toolCallId: string;
          toolName: string;
          output?: unknown;
          error?: unknown;
          isError?: boolean;
        };

        logDebug("Tool result", toolResult.output);

        if (!toolResult.isError && !toolResult.error) {
          yield {
            type: SSEEventType.ACTION_COMPLETED,
          };
        }
        return;
      }

      case "error": {
        const errorChunk = chunk as { error?: { message?: string } | string };
        const content =
          typeof errorChunk.error === "string"
            ? errorChunk.error
            : errorChunk.error?.message || "An error occurred";

        yield {
          type: SSEEventType.ERROR,
          content,
        };
        return;
      }

      case "finish": {
        yield {
          type: SSEEventType.DONE,
        };
        return;
      }
    }
  }
}

/**
 * AI SDK-based computer use streamer
 * 
 * Works with any AI SDK provider that supports tool calling.
 */
export class AISDKComputerStreamer implements ComputerInteractionStreamerFacade {
  public instructions: string;
  public desktop: Sandbox;
  public resolutionScaler: ResolutionScaler;
  private providerConfig: ProviderConfig;

  constructor(
    desktop: Sandbox, 
    resolutionScaler: ResolutionScaler,
    providerConfig: ProviderConfig
  ) {
    this.desktop = desktop;
    this.resolutionScaler = resolutionScaler;
    this.providerConfig = providerConfig;
    this.instructions = COMPUTER_USE_INSTRUCTIONS;
  }

  async executeAction(action: unknown): Promise<void> {
    // Actions are executed through the tool's execute function
    // This method is kept for compatibility with the facade interface
  }

  async *stream(
    props: ComputerInteractionStreamerFacadeStreamProps
  ): AsyncGenerator<SSEEvent> {
    const { messages, signal } = props;

    try {
      console.log("[AI_SDK_STREAMER] Creating provider instance:", {
        type: this.providerConfig.type,
        model: this.providerConfig.model,
        hasApiKey: !!this.providerConfig.apiKey,
        apiKeyLength: this.providerConfig.apiKey?.length,
        baseUrl: this.providerConfig.baseUrl,
      });
      
      // Validate required fields
      if (!this.providerConfig.apiKey) {
        throw new Error("API key is required for provider");
      }
      if (!this.providerConfig.model) {
        throw new Error("Model is required for provider");
      }
      
      // Create the model instance
      const model = createProviderInstance(this.providerConfig);
      
      console.log("[AI_SDK_STREAMER] Provider instance created successfully");
      
      // Create tool context
      const toolContext: ComputerToolContext = {
        desktop: this.desktop,
        resolutionScaler: this.resolutionScaler,
      };

      // Create the computer tool
      const computerTool = createComputerTool(toolContext);

      // Get model resolution for system prompt
      const modelResolution = this.resolutionScaler.getScaledResolution();

      // Take initial screenshot so model can see the desktop
      console.log("[AI_SDK_STREAMER] Taking initial screenshot...");
      const initialScreenshotData = await this.resolutionScaler.takeScreenshot();
      const initialScreenshotBase64 = Buffer.from(initialScreenshotData).toString("base64");
      console.log("[AI_SDK_STREAMER] Initial screenshot taken");

      // Convert messages to AI SDK format with initial screenshot
      const formattedMessages: ModelMessage[] = [];
      
      // Add initial screenshot as first user message
      formattedMessages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: "Here is the current state of the desktop. Please help me with my task.",
          },
          {
            type: "image",
            image: initialScreenshotBase64,
          },
        ],
      });
      
      // Add remaining messages (filter to only user/assistant messages with valid content)
      for (const msg of messages) {
        // Only add user and assistant messages, skip system/tool messages
        if (msg.role === "user" || msg.role === "assistant") {
          formattedMessages.push({
            role: msg.role,
            content: msg.content,
          } as ModelMessage);
        }
      }

      // Check if this provider supports native computer use
      const capabilities = getProviderCapabilities(
        this.providerConfig.type, 
        this.providerConfig.model
      );

      // Use native computer use if supported and enabled
      if (capabilities.hasNativeComputerUse && this.providerConfig.useNativeComputerUse) {
        yield* this.streamNativeComputerUse(formattedMessages, signal);
        return;
      }

      // Otherwise use function calling approach
      yield* this.streamWithToolCalling(model, formattedMessages, computerTool, signal);
      
    } catch (error) {
      logError("AI_SDK_STREAMER", error);
      yield {
        type: SSEEventType.ERROR,
        content: error instanceof Error ? error.message : "An error occurred with the AI service.",
      };
    }
  }

  /**
   * Stream using function calling (tool-based approach)
   * Works with any provider that supports tool calling
   */
  private async *streamWithToolCalling(
    model: ReturnType<typeof createProviderInstance>,
    messages: ModelMessage[],
    computerTool: ReturnType<typeof createComputerTool>,
    signal: AbortSignal
  ): AsyncGenerator<SSEEvent> {
    const sseAdapter = new ToolLoopSSEAdapter();

    // Use streamText for real-time streaming
    const result = streamText({
      model,
      system: this.instructions + `\n\nScreen resolution: ${this.resolutionScaler.getScaledResolution().join('x')}`,
      messages,
      tools: {
        computer: computerTool,
      },
      stopWhen: stepCountIs(50), // Maximum 50 tool call steps
      onStepFinish: async (step) => {
        logDebug("Step finished", step);
      },
    });

    // Process the stream
    for await (const chunk of result.fullStream) {
      if (signal.aborted) {
        yield {
          type: SSEEventType.DONE,
          content: "Generation stopped by user",
        };
        return;
      }

      for (const event of sseAdapter.mapChunkToSSE(chunk)) {
        yield event;

        if (event.type === SSEEventType.DONE) {
          return;
        }
      }
    }
  }

  /**
   * Stream using native computer use (OpenAI Responses API or Anthropic computer tools)
   * This is handled by delegating to the existing specialized streamers
   */
  private async *streamNativeComputerUse(
    messages: ModelMessage[],
    signal: AbortSignal
  ): AsyncGenerator<SSEEvent> {
    // Import the native streamers dynamically
    const { OpenAIComputerStreamer } = await import("@/lib/streaming/openai");
    const { AnthropicComputerStreamer } = await import("@/lib/streaming/anthropic");

    let streamer: ComputerInteractionStreamerFacade;

    if (this.providerConfig.type === "openai") {
      streamer = new OpenAIComputerStreamer(this.desktop, this.resolutionScaler);
    } else if (this.providerConfig.type === "anthropic") {
      streamer = new AnthropicComputerStreamer(this.desktop, this.resolutionScaler);
    } else {
      // Fallback to tool calling
      const model = createProviderInstance(this.providerConfig);
      const toolContext: ComputerToolContext = {
        desktop: this.desktop,
        resolutionScaler: this.resolutionScaler,
      };
      const computerTool = createComputerTool(toolContext);
      yield* this.streamWithToolCalling(model, messages, computerTool, signal);
      return;
    }

    // Use the native streamer
    yield* streamer.stream({ messages, signal });
  }
}

/**
 * Create a streaming response using the AI SDK streamer
 */
export function createAISDKStreamingResponse(
  desktop: Sandbox,
  resolutionScaler: ResolutionScaler,
  providerConfig: ProviderConfig,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  signal: AbortSignal
): Response {
  const streamer = new AISDKComputerStreamer(desktop, resolutionScaler, providerConfig);
  const generator = streamer.stream({ messages, signal });
  return createStreamingResponse(generator);
}

// Re-export createStreamingResponse for convenience
export { createStreamingResponse } from "@/lib/streaming";
