"use server";

import { ModelInfo, BuiltinProviderType, PROVIDER_BASE_URLS } from "@/lib/providers";
import { hasVisionCapability } from "@/lib/providers/vision-detection";

type OpenRouterModel = {
  id: string;
  name?: string;
  context_length?: number;
  architecture?: { modality?: string };
};

type GenericModelResponse = {
  data?: Array<{ id: string; name?: string; owned_by?: string; ownedBy?: string; context_length?: number }>;
  models?: Array<{ id?: string; name?: string }>;
};

async function fetchOpenRouterModels(apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { data?: OpenRouterModel[] };
  const models = payload.data || [];

  return models.map((model) => ({
    id: model.id,
    name: model.name || model.id,
    contextLength: model.context_length,
    hasVision: model.architecture?.modality?.includes("image") ?? hasVisionCapability(model.id),
  }));
}

async function fetchOllamaModels(baseUrl: string): Promise<ModelInfo[]> {
  const tagsBase = baseUrl.replace(/\/v1\/?$/, "");
  const response = await fetch(`${tagsBase}/api/tags`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
  return (payload.models || []).map((model) => {
    const id = model.name || model.model || "unknown";
    return {
      id,
      name: id,
      hasVision: hasVisionCapability(id),
    };
  });
}

async function fetchOpenAICompatibleModels(baseUrl: string, apiKey?: string): Promise<ModelInfo[]> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as GenericModelResponse;
  const models = payload.data || [];
  return models.map((model) => ({
    id: model.id,
    name: model.name || model.id,
    ownedBy: model.owned_by || model.ownedBy,
    contextLength: model.context_length,
    hasVision: hasVisionCapability(model.id),
  }));
}

export async function fetchModelsAction(
  apiKey: string | undefined,
  type: "builtin" | "custom",
  providerType?: BuiltinProviderType,
  baseUrl?: string,
): Promise<{ success: boolean; models: ModelInfo[]; error?: string }> {
  try {
    const normalizedApiKey = apiKey?.trim();

    if (type === "builtin" && providerType === "openrouter") {
      if (!normalizedApiKey) {
        return { success: false, models: [], error: "API key is required for openrouter" };
      }
      const models = await fetchOpenRouterModels(normalizedApiKey);
      return { success: true, models };
    }

    if (type === "builtin" && providerType === "ollama") {
      const models = await fetchOllamaModels(baseUrl || PROVIDER_BASE_URLS.ollama);
      return { success: true, models };
    }

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
      const models = await fetchOpenAICompatibleModels(baseUrl, normalizedApiKey);
      return { success: true, models };
    }

    if (type === "builtin" && providerType) {
      const knownUrl = PROVIDER_BASE_URLS[providerType];
      if (!knownUrl) {
        return { success: false, models: [], error: `Unknown provider: ${providerType}` };
      }

      if (!normalizedApiKey && providerType !== "ollama") {
        return { success: false, models: [], error: `API key is required for ${providerType}` };
      }

      if (providerType === "google") {
        const endpointUrl = `${knownUrl}/models?key=${normalizedApiKey}`;
        const response = await fetch(endpointUrl, {
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          return { success: false, models: [], error: `API returned ${response.status}` };
        }

        const data = (await response.json()) as { models?: Array<{ name: string; displayName?: string }> };
        const models = (data.models || []).map((model) => ({
          id: model.name,
          name: model.displayName || model.name,
          hasVision: hasVisionCapability(model.name),
        }));
        return { success: true, models };
      }

      const models = await fetchOpenAICompatibleModels(knownUrl, normalizedApiKey);
      return { success: true, models };
    }

    return { success: false, models: [], error: "Invalid configuration" };
  } catch (error) {
    return {
      success: false,
      models: [],
      error: error instanceof Error ? error.message : "Failed to fetch models",
    };
  }
}
