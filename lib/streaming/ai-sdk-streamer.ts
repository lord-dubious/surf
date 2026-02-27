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
import { createProviderInstance, ProviderConfig, getProviderCapabilities, validateProviderConfig } from "@/lib/providers";
import { SSEEventType, SSEEvent } from "@/types/api";
import type { ComputerAction } from "@/types/anthropic";
import { logDebug, logError } from "@/lib/logger";

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
      
      // Validate required fields per provider
      const validationError = validateProviderConfig(this.providerConfig);
      if (validationError) {
        throw new Error(validationError);
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

      switch (chunk.type) {
        case "text-delta": {
          yield {
            type: SSEEventType.REASONING,
            content: chunk.text,
          };
          break;
        }

        case "tool-call": {
          // AI SDK v6: tool-call has toolCallId, toolName, input
          const toolCall = chunk as { toolCallId: string; toolName: string; input: Record<string, unknown> };
          
          // Yield the action event
          yield {
            type: SSEEventType.ACTION,
            action: toolCall.input as unknown as ComputerAction,
          };

          // The tool execution happens automatically in the AI SDK
          // We just need to signal completion
          yield {
            type: SSEEventType.ACTION_COMPLETED,
          };
          break;
        }

        case "tool-result": {
          // Tool has been executed, result contains screenshot
          // AI SDK v6: tool-result has toolCallId, toolName, input, output
          const toolResult = chunk as { toolCallId: string; toolName: string; output: unknown };
          logDebug("Tool result", toolResult.output);
          break;
        }

        case "error": {
          const errorChunk = chunk as { error?: { message?: string } };
          yield {
            type: SSEEventType.ERROR,
            content: errorChunk.error?.message || "An error occurred",
          };
          break;
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
