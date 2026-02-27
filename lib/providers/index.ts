/**
 * Provider registry using AI SDK packages
 * 
 * This module provides a unified interface for all AI providers,
 * leveraging the Vercel AI SDK for consistent behavior across providers.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createXai } from "@ai-sdk/xai";
import type { 
  ProviderConfig, 
  ProviderType, 
  BuiltinProviderType,
  ProviderCapabilities,
  ModelInfo 
} from "./types";
import { BUILTIN_PROVIDER_CAPABILITIES, supportsNativeComputerUse, providerRequiresApiKey } from "./types";

// Re-export types
export * from "./types";

/**
 * Create a provider instance based on configuration
 */
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
    
    case "custom":
      if (!baseUrl) {
        throw new Error("Base URL is required for custom providers");
      }
      // Use OpenAI-compatible provider for custom endpoints
      return createOpenAICompatibleProvider({
        name: config.name,
        baseURL: baseUrl,
        apiKey: normalizedApiKey,
      })(model);
    
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Create an OpenAI-compatible provider for custom endpoints
 * This works with vLLM, Ollama, Together AI, Fireworks, etc.
 */
function createOpenAICompatibleProvider(options: {
  name: string;
  baseURL: string;
  apiKey?: string;
}) {
  // Use @ai-sdk/openai for custom endpoints
  return createOpenAI({
    ...options,
  });
}

/**
 * Get capabilities for a provider
 */
export function getProviderCapabilities(
  type: ProviderType,
  modelId?: string
): ProviderCapabilities {
  if (type === "custom") {
    // Custom providers: assume vision + tool calling, no native computer use
    return {
      hasVision: true,
      hasNativeComputerUse: modelId ? supportsNativeComputerUse(modelId) : false,
      hasToolCalling: true,
      hasStreaming: true,
    };
  }

  const baseCapabilities = BUILTIN_PROVIDER_CAPABILITIES[type as BuiltinProviderType];
  
  // Override native computer use based on specific model
  if (modelId && !supportsNativeComputerUse(modelId)) {
    return {
      ...baseCapabilities,
      hasNativeComputerUse: false,
    };
  }

  return baseCapabilities;
}

/**
 * Fetch available models from a provider's API
 * Works with OpenAI-compatible /models endpoint
 */
export async function fetchAvailableModels(
  baseUrl: string,
  apiKey?: string,
  providerType?: BuiltinProviderType
): Promise<ModelInfo[]> {
  try {
    // Normalize base URL - remove trailing slash
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    
    const hasApiKey = Boolean(apiKey);

    // Google uses query param for API key
    let endpointUrl: string;
    let headers: Record<string, string> = {};
    
    if (providerType === "google") {
      endpointUrl = hasApiKey
        ? `${normalizedBaseUrl}/models?key=${apiKey}`
        : `${normalizedBaseUrl}/models`;
    } else {
      endpointUrl = `${normalizedBaseUrl}/models`;
      if (hasApiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
    }
    
    console.log(`[Model Fetch] Fetching models from: ${endpointUrl}`);
    
    const response = await fetch(endpointUrl, {
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[Model Fetch] Failed: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { 
      data?: Array<{ id: string; name?: string; owned_by?: string; ownedBy?: string }>;
      models?: Array<{ id?: string; name?: string }>;
    };
    
    console.log(`[Model Fetch] Response data:`, JSON.stringify(data).substring(0, 500));
    
    // OpenAI-compatible format: { data: [{ id: string, ... }] }
    if (data.data && Array.isArray(data.data)) {
      const models = data.data.map((model) => ({
        id: model.id,
        name: model.name || model.id,
        ownedBy: model.owned_by || model.ownedBy,
      }));
      console.log(`[Model Fetch] Found ${models.length} models (OpenAI format)`);
      return models;
    }

    // Ollama format: { models: [{ name: string, ... }] }
    if (data.models && Array.isArray(data.models)) {
      const models = data.models.map((model) => ({
        id: model.name || model.id || "unknown",
        name: model.name || model.id || "unknown",
      }));
      console.log(`[Model Fetch] Found ${models.length} models (Ollama format)`);
      return models;
    }

    // Some APIs return a flat array of models
    if (Array.isArray(data)) {
      const models = (data as Array<{ id?: string; name?: string }>).map((model) => ({
        id: model.id || model.name || "unknown",
        name: model.name || model.id || "unknown",
      }));
      console.log(`[Model Fetch] Found ${models.length} models (flat array format)`);
      return models;
    }

    console.log(`[Model Fetch] No models found in response`);
    return [];
  } catch (error) {
    console.error("[Model Fetch] Error:", error);
    return [];
  }
}

/**
 * Fetch models for a built-in provider using its known base URL
 */
export async function fetchModelsForProvider(
  type: BuiltinProviderType,
  apiKey?: string
): Promise<ModelInfo[]> {
  const baseUrl = PROVIDER_BASE_URLS[type];
  if (!baseUrl) {
    return [];
  }
  return fetchAvailableModels(baseUrl, apiKey, type);
}

/**
 * API base URLs for built-in providers
 */
export const PROVIDER_BASE_URLS: Record<BuiltinProviderType, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  xai: "https://api.x.ai/v1",
};

/**
 * Default models for each built-in provider
 */
export const DEFAULT_MODELS: Record<BuiltinProviderType, string> = {
  openai: "computer-use-preview",
  anthropic: "claude-3-7-sonnet-latest",
  google: "gemini-2.0-flash-exp",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-large-latest",
  xai: "grok-2-1212",
};

/**
 * Provider display names for UI
 */
export const PROVIDER_DISPLAY_NAMES: Record<ProviderType, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  groq: "Groq",
  mistral: "Mistral AI",
  xai: "xAI",
  custom: "Custom Provider",
};

/**
 * Check whether a provider config can fetch models with current credentials
 */
function canFetchModels(type: ProviderType, apiKey?: string): boolean {
  return !providerRequiresApiKey(type) || Boolean(apiKey);
}

/**
 * Test connection to a provider
 */
export async function testProviderConnection(
  config: ProviderConfig
): Promise<{ success: boolean; error?: string; models?: ModelInfo[] }> {
  try {
    // For custom providers, try to fetch models
    if (config.type === "custom" && config.baseUrl) {
      const models = await fetchAvailableModels(config.baseUrl, config.apiKey);
      return { 
        success: models.length > 0, 
        models,
        error: models.length === 0 ? "No models found" : undefined 
      };
    }

    // For built-in providers, fetch models from their API
    if (config.type !== "custom") {
      if (!canFetchModels(config.type, config.apiKey)) {
        return { success: false, error: "API key is required for provider" };
      }

      const models = await fetchModelsForProvider(config.type, config.apiKey);
      return { 
        success: true, 
        models,
      };
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Connection failed" 
    };
  }
}
