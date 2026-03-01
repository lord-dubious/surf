"use server";

import {
  ModelInfo,
  BuiltinProviderType,
  PROVIDER_BASE_URLS,
  fetchAvailableModels,
  fetchGoogleModels,
  fetchModelsForProvider,
  fetchOllamaModels,
  fetchOpenRouterModels,
} from "@/lib/providers";

export async function fetchModelsAction(
  apiKey: string | undefined,
  type: "builtin" | "custom",
  providerType?: BuiltinProviderType,
  baseUrl?: string,
): Promise<{ success: boolean; models: ModelInfo[]; error?: string }> {
  try {
    const normalizedApiKey = apiKey?.trim();

    if (type === "custom") {
      if (!baseUrl) {
        return { success: false, models: [], error: "Base URL is required" };
      }

      if (baseUrl.includes("openrouter.ai")) {
        if (!normalizedApiKey) {
          return { success: false, models: [], error: "API key is required for OpenRouter" };
        }

        const models = await fetchOpenRouterModels(normalizedApiKey);
        return { success: true, models };
      }

      const models = await fetchAvailableModels(baseUrl, normalizedApiKey);
      return { success: true, models };
    }

    if (!providerType) {
      return { success: false, models: [], error: "Invalid configuration" };
    }

    if (providerType === "ollama") {
      const models = await fetchOllamaModels(baseUrl || PROVIDER_BASE_URLS.ollama);
      return { success: true, models };
    }

    if (providerType === "google") {
      if (!normalizedApiKey) {
        return { success: false, models: [], error: "API key is required for google" };
      }

      const models = await fetchGoogleModels(normalizedApiKey);
      return { success: true, models };
    }

    if (providerType === "openrouter") {
      if (!normalizedApiKey) {
        return { success: false, models: [], error: "API key is required for openrouter" };
      }

      const models = await fetchOpenRouterModels(normalizedApiKey);
      return { success: true, models };
    }

    if (!normalizedApiKey) {
      return { success: false, models: [], error: `API key is required for ${providerType}` };
    }

    const models = await fetchModelsForProvider(providerType, normalizedApiKey);
    return { success: true, models };
  } catch (error) {
    return {
      success: false,
      models: [],
      error: error instanceof Error ? error.message : "Failed to fetch models",
    };
  }
}
