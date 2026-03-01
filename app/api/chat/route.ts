import { Sandbox } from "@e2b/desktop";
import { ComputerModel, SSEEvent, SSEEventType } from "@/types/api";
import type { ChatMessageContent } from "@/types/chat";
import type { ModelMessage } from "ai";
import {
  ComputerInteractionStreamerFacade,
  createStreamingResponse,
} from "@/lib/streaming";
import { SANDBOX_TIMEOUT_MS } from "@/lib/config";
import { OpenAIComputerStreamer } from "@/lib/streaming/openai";
import { AnthropicComputerStreamer } from "@/lib/streaming/anthropic";
import { AISDKComputerStreamer } from "@/lib/streaming/ai-sdk-streamer";
import { logError } from "@/lib/logger";
import { ResolutionScaler } from "@/lib/streaming/resolution";
import type { ProviderConfig } from "@/lib/providers/types";

export const maxDuration = 800;

function isValidChatContent(content: unknown): content is ChatMessageContent {
  if (typeof content === "string") {
    return true;
  }

  if (!Array.isArray(content)) {
    return false;
  }

  return content.every((part) => {
    if (!part || typeof part !== "object" || !("type" in part)) {
      return false;
    }

    if (part.type === "text") {
      return typeof (part as { text?: unknown }).text === "string";
    }

    if (part.type === "image") {
      return typeof (part as { image?: unknown }).image === "string";
    }

    return false;
  });
}

interface ChatRequestBody {
  messages: Array<{ role: "user" | "assistant"; content: ChatMessageContent }>;
  sandboxId?: string;
  resolution: [number, number];
  model?: ComputerModel;
  providerConfig?: ProviderConfig;
  /** E2B API key from UI (fallback to env) */
  e2bApiKey?: string;
}

class StreamerFactory {
  static getStreamer(
    model: ComputerModel,
    desktop: Sandbox,
    resolution: [number, number]
  ): ComputerInteractionStreamerFacade {
    const resolutionScaler = new ResolutionScaler(desktop, resolution);

    switch (model) {
      case "anthropic":
        return new AnthropicComputerStreamer(desktop, resolutionScaler);
      case "openai":
      default:
        return new OpenAIComputerStreamer(desktop, resolutionScaler);
    }
  }

  static getStreamerFromProviderConfig(
    providerConfig: ProviderConfig,
    desktop: Sandbox,
    resolution: [number, number]
  ): ComputerInteractionStreamerFacade {
    const resolutionScaler = new ResolutionScaler(desktop, resolution);
    return new AISDKComputerStreamer(desktop, resolutionScaler, providerConfig);
  }
}

export async function POST(request: Request) {
  const abortController = new AbortController();
  const { signal } = abortController;

  request.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  let body: ChatRequestBody;
  try {
    body = await request.json() as ChatRequestBody;
  } catch (e) {
    logError("Failed to parse request body:", e);
    return new Response("Invalid request body", { status: 400 });
  }
  
  const {
    messages,
    sandboxId,
    resolution,
    model = "openai",
    providerConfig,
    e2bApiKey: clientE2bKey,
  } = body;

  console.log("[API] Request received:", {
    hasProviderConfig: !!providerConfig,
    providerType: providerConfig?.type,
    providerModel: providerConfig?.model,
    messagesCount: messages?.length,
    hasClientE2bKey: !!clientE2bKey
  });

  if (!Array.isArray(messages)) {
    logError("Invalid chat payload: messages must be an array", { messagesType: typeof messages });
    return new Response(JSON.stringify({ error: "Invalid payload: messages must be an array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const invalidMessageIndex = messages.findIndex(
    (message) =>
      !message ||
      (message.role !== "user" && message.role !== "assistant") ||
      !isValidChatContent(message.content),
  );

  if (invalidMessageIndex !== -1) {
    const invalidMessage = messages[invalidMessageIndex];
    const contentKind = Array.isArray(invalidMessage?.content) ? "array" : typeof invalidMessage?.content;
    logError("Invalid chat payload: malformed message", { index: invalidMessageIndex, role: invalidMessage?.role, contentKind });
    return new Response(JSON.stringify({ error: "Invalid payload: each message must include a valid role and content" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Use client-provided E2B key or fallback to env
  const apiKey = clientE2bKey || process.env.E2B_API_KEY;

  if (!apiKey) {
    logError("E2B API key not found - neither in request nor environment");
    return new Response(JSON.stringify({ error: "E2B API key not found. Please set it in Settings or .env file." }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const modelMessages: ModelMessage[] = messages.map((message) => {
    if (message.role === "assistant") {
      const content = typeof message.content === "string"
        ? message.content
        : message.content
            .filter((part): part is { type: "text"; text: string } => part.type === "text")
            .map((part) => part.text)
            .join("\n");

      return {
        role: "assistant",
        content,
      };
    }

    const content = typeof message.content === "string"
      ? [{ type: "text" as const, text: message.content }]
      : message.content.map((part) =>
          part.type === "text"
            ? { type: "text" as const, text: part.text }
            : { type: "image" as const, image: part.image },
        );

    return {
      role: "user",
      content,
    };
  });

  let desktop: Sandbox | undefined;
  let activeSandboxId = sandboxId;
  let vncUrl: string | undefined;

  try {
    if (!activeSandboxId) {
      const newSandbox = await Sandbox.create({
        resolution,
        dpi: 96,
        timeoutMs: SANDBOX_TIMEOUT_MS,
      });

      await newSandbox.stream.start();

      activeSandboxId = newSandbox.sandboxId;
      vncUrl = newSandbox.stream.getUrl();
      desktop = newSandbox;
    } else {
      desktop = await Sandbox.connect(activeSandboxId);
    }

    if (!desktop) {
      return new Response("Failed to connect to sandbox", { status: 500 });
    }

    desktop.setTimeout(SANDBOX_TIMEOUT_MS);

    try {
      // Use provider config if provided, otherwise fall back to legacy model selection
      const streamer = providerConfig
        ? StreamerFactory.getStreamerFromProviderConfig(
            providerConfig as ProviderConfig,
            desktop,
            resolution
          )
        : StreamerFactory.getStreamer(
            model as ComputerModel,
            desktop,
            resolution
          );

      if (!sandboxId && activeSandboxId && vncUrl) {
        async function* stream(): AsyncGenerator<SSEEvent> {
          yield {
            type: SSEEventType.SANDBOX_CREATED,
            sandboxId: activeSandboxId!,
            vncUrl: vncUrl!,
          };

          yield* streamer.stream({ messages: modelMessages, signal });
        }

        return createStreamingResponse(stream());
      } else {
        return createStreamingResponse(streamer.stream({ messages: modelMessages, signal }));
      }
    } catch (error) {
      logError("Error from streaming service:", error);

      return new Response(
        "An error occurred with the AI service. Please try again.",
        { status: 500 }
      );
    }
  } catch (error) {
    logError("Error connecting to sandbox:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to connect to sandbox";
    const errorStack = error instanceof Error ? error.stack : "";
    console.error("[API] Sandbox error:", errorMessage, errorStack);
    return new Response(JSON.stringify({ error: errorMessage }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}