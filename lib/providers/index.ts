import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { huggingface } from "@ai-sdk/huggingface";
import type {
  ProviderConfig,
  ProviderType,
  BuiltinProviderType,
  ProviderCapabilities,
  ModelInfo,
} from "./types";
import { BUILTIN_PROVIDER_CAPABILITIES, supportsNativeComputerUse, providerRequiresApiKey } from "./types";
import { hasVisionCapability } from "./vision-detection";

export * from "./types";

function createOpenRouterProvider(apiKey: string) {
  return createOpenRouter({
    apiKey,
    headers: {
      "HTTP-Referer": "https://github.com/e2b-dev/surf",
      "X-Title": "Surf Computer Agent",
    },
  });
}

export function createProviderInstance(config: ProviderConfig) {
  const { type, apiKey, baseUrl, model } = config;
  const normalizedApiKey = apiKey || "";

  switch (type) {
    case "openai":
      return createOpenAI({ apiKey: normalizedApiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey: normalizedApiKey })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: normalizedApiKey })(model);
    case "groq":
      return createGroq({ apiKey: normalizedApiKey })(model);
    case "mistral":
      return createMistral({ apiKey: normalizedApiKey })(model);
    case "xai":
      return createXai({ apiKey: normalizedApiKey })(model);
    case "openrouter":
      return createOpenRouterProvider(normalizedApiKey)(model);
    case "huggingface":
      return huggingface(model);
    case "ollama":
      return createOpenAICompatible({
        name: "ollama",
        baseURL: baseUrl || "http://localhost:11434/v1",
      })(model);
    case "custom": {
      if (!baseUrl) {
        throw new Error("Base URL is required for custom providers");
      }

      if (baseUrl.includes("openrouter.ai")) {
        return createOpenRouterProvider(normalizedApiKey)(model);
      }

      return createOpenAICompatible({
        name: config.name || "custom",
        apiKey: normalizedApiKey || undefined,
        baseURL: baseUrl,
      })(model);
    }
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

export function getProviderCapabilities(type: ProviderType, modelId?: string): ProviderCapabilities {
  if (type === "custom") {
    return {
      hasVision: modelId ? hasVisionCapability(modelId) : true,
      hasNativeComputerUse: modelId ? supportsNativeComputerUse(modelId) : false,
      hasToolCalling: true,
      hasStreaming: true,
    };
  }

  const baseCapabilities = BUILTIN_PROVIDER_CAPABILITIES[type as BuiltinProviderType];
  if (modelId && !supportsNativeComputerUse(modelId)) {
    return { ...baseCapabilities, hasNativeComputerUse: false };
  }

  return baseCapabilities;
}

export const PROVIDER_BASE_URLS: Record<BuiltinProviderType, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  xai: "https://api.x.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  huggingface: "https://api-inference.huggingface.co/v1",
  ollama: "http://localhost:11434/v1",
};

export const DEFAULT_MODELS: Record<BuiltinProviderType, string> = {
  openai: "computer-use-preview",
  anthropic: "claude-3-7-sonnet-latest",
  google: "gemini-2.0-flash-exp",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-large-latest",
  xai: "grok-2-1212",
  openrouter: "google/gemini-2.0-flash-exp:free",
  huggingface: "Qwen/Qwen2.5-VL-7B-Instruct",
  ollama: "llava",
};

export const PROVIDER_DISPLAY_NAMES: Record<ProviderType, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  groq: "Groq",
  mistral: "Mistral AI",
  xai: "xAI",
  openrouter: "OpenRouter",
  huggingface: "HuggingFace",
  ollama: "Ollama (Local)",
  custom: "Custom Provider",
};

function canFetchModels(type: ProviderType, apiKey?: string): boolean {
  return !providerRequiresApiKey(type) || Boolean(apiKey);
}

export async function fetchAvailableModels(baseUrl: string, apiKey?: string): Promise<ModelInfo[]> {
  try {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${normalizedBaseUrl}/models`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      data?: Array<{ id: string; name?: string; owned_by?: string; ownedBy?: string }>;
      models?: Array<{ id?: string; name?: string }>;
    };

    if (Array.isArray(data.data)) {
      return data.data.map((model) => ({
        id: model.id,
        name: model.name || model.id,
        ownedBy: model.owned_by || model.ownedBy,
        hasVision: hasVisionCapability(model.id),
      }));
    }

    if (Array.isArray(data.models)) {
      return data.models.map((model) => {
        const id = model.name || model.id || "unknown";
        return {
          id,
          name: id,
          hasVision: hasVisionCapability(id),
        };
      });
    }

    return [];
  } catch {
    return [];
  }
}

export async function fetchModelsForProvider(type: BuiltinProviderType, apiKey?: string): Promise<ModelInfo[]> {
  const baseUrl = PROVIDER_BASE_URLS[type];
  if (!baseUrl) {
    return [];
  }

  if (!canFetchModels(type, apiKey)) {
    return [];
  }

  return fetchAvailableModels(baseUrl, apiKey);
}

export async function testProviderConnection(
  config: ProviderConfig,
): Promise<{ success: boolean; error?: string; models?: ModelInfo[] }> {
  try {
    if (config.type === "custom") {
      if (!config.baseUrl) {
        return { success: false, error: "Base URL is required for custom providers" };
      }

      const models = await fetchAvailableModels(config.baseUrl, config.apiKey);
      return { success: models.length > 0, models, error: models.length === 0 ? "No models found" : undefined };
    }

    if (config.type === "ollama") {
      const models = await fetchAvailableModels(config.baseUrl || PROVIDER_BASE_URLS.ollama, config.apiKey);
      return { success: true, models };
    }

    if (!canFetchModels(config.type, config.apiKey)) {
      return { success: false, error: "API key is required for provider" };
    }

    const models = await fetchModelsForProvider(config.type, config.apiKey);
    return { success: true, models };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}
