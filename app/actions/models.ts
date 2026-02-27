"use server";

import { ModelInfo, BuiltinProviderType, PROVIDER_BASE_URLS } from "@/lib/providers";

/**
 * Server action to fetch models from a provider's API
 * This bypasses CORS restrictions since server-side requests don't have CORS
 */
export async function fetchModelsAction(
  apiKey: string | undefined,
  type: "builtin" | "custom",
  providerType?: BuiltinProviderType,
  baseUrl?: string
): Promise<{ success: boolean; models: ModelInfo[]; error?: string }> {
  try {
    const normalizedApiKey = apiKey?.trim();

    let endpointUrl: string;
    let headers: Record<string, string> = {};
    
    if (type === "custom" && baseUrl) {
      // Custom provider - use provided base URL
      endpointUrl = baseUrl.replace(/\/+$/, "");
      if (normalizedApiKey) {
        headers["Authorization"] = `Bearer ${normalizedApiKey}`;
      }
    } else if (type === "builtin" && providerType) {
      if (!normalizedApiKey) {
        return { success: false, models: [], error: `API key is required for ${providerType}` };
      }

      // Built-in provider - use known base URL
      const knownUrl = PROVIDER_BASE_URLS[providerType];
      if (!knownUrl) {
        return { success: false, models: [], error: `Unknown provider: ${providerType}` };
      }
      
      // Google uses query param for API key, not Authorization header
      if (providerType === "google") {
        endpointUrl = `${knownUrl}/models?key=${normalizedApiKey}`;
      } else {
        endpointUrl = `${knownUrl}/models`;
        headers["Authorization"] = `Bearer ${normalizedApiKey}`;
      }
    } else {
      return { success: false, models: [], error: "Invalid configuration" };
    }

    console.log(`[Server Model Fetch] Fetching from: ${endpointUrl}`);

    const response = await fetch(endpointUrl, {
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      // Add timeout
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[Server Model Fetch] Failed: ${response.status}`, errorText);
      return { 
        success: false, 
        models: [], 
        error: `API returned ${response.status}: ${response.statusText}` 
      };
    }

    const data = await response.json() as { 
      data?: Array<{ id: string; name?: string; owned_by?: string; ownedBy?: string }>;
      models?: Array<{ id?: string; name?: string }>;
    };

    console.log(`[Server Model Fetch] Response received`);

    // OpenAI-compatible format: { data: [{ id: string, ... }] }
    if (data.data && Array.isArray(data.data)) {
      const models = data.data.map((model) => ({
        id: model.id,
        name: model.name || model.id,
        ownedBy: model.owned_by || model.ownedBy,
      }));
      console.log(`[Server Model Fetch] Found ${models.length} models (OpenAI format)`);
      return { success: true, models };
    }

    // Ollama format: { models: [{ name: string, ... }] }
    if (data.models && Array.isArray(data.models)) {
      const models = data.models.map((model) => ({
        id: model.name || model.id || "unknown",
        name: model.name || model.id || "unknown",
      }));
      console.log(`[Server Model Fetch] Found ${models.length} models (Ollama format)`);
      return { success: true, models };
    }

    // Some APIs return a flat array
    if (Array.isArray(data)) {
      const models = (data as Array<{ id?: string; name?: string }>).map((model) => ({
        id: model.id || model.name || "unknown",
        name: model.name || model.id || "unknown",
      }));
      console.log(`[Server Model Fetch] Found ${models.length} models (flat array)`);
      return { success: true, models };
    }

    console.log(`[Server Model Fetch] No models found in response`);
    return { success: false, models: [], error: "No models found in API response" };
  } catch (error) {
    console.error("[Server Model Fetch] Error:", error);
    return { 
      success: false, 
      models: [], 
      error: error instanceof Error ? error.message : "Failed to fetch models" 
    };
  }
}
