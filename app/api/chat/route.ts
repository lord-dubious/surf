import { Sandbox } from "@e2b/desktop";
import { ComputerModel, SSEEvent, SSEEventType } from "@/types/api";
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

interface ChatRequestBody {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
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

  // Use client-provided E2B key or fallback to env
  const apiKey = clientE2bKey || process.env.E2B_API_KEY;

  if (!apiKey) {
    logError("E2B API key not found - neither in request nor environment");
    return new Response(JSON.stringify({ error: "E2B API key not found. Please set it in Settings or .env file." }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

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

          yield* streamer.stream({ messages, signal });
        }

        return createStreamingResponse(stream());
      } else {
        return createStreamingResponse(streamer.stream({ messages, signal }));
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
