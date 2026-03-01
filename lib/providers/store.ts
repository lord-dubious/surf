/**
 * Provider configuration storage using localStorage
 * 
 * Manages persistent storage of provider configurations on the client side.
 */

import type { ProviderConfig, ProviderType, ModelInfo } from "./types";

const STORAGE_KEY = "surf_provider_configs";
const ACTIVE_PROVIDER_KEY = "surf_active_provider";
const E2B_API_KEY_STORAGE = "surf_e2b_api_key";

export interface ModelPreset {
  label: string;
  type: ProviderType;
  model: string;
  hint: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
  { label: "Gemini 2.0 Flash — Free", type: "openrouter", model: "google/gemini-2.0-flash-exp:free", hint: "Free, vision-capable. Get key at openrouter.ai" },
  { label: "Gemini via AI Studio — Free", type: "google", model: "gemini-2.0-flash", hint: "60 RPM free. Get key at aistudio.google.com" },
  { label: "Kimi K2.5 — $0.50/M", type: "openrouter", model: "moonshotai/kimi-k2.5", hint: "Best for GUI automation tasks" },
  { label: "Llama 3.2 Vision — Free", type: "openrouter", model: "meta-llama/llama-3.2-11b-vision-instruct:free", hint: "Open weights, free tier on OpenRouter" },
  { label: "Local Ollama", type: "ollama", model: "", hint: "Uses your local Ollama instance at localhost:11434" },
];


/**
 * Get stored E2B API key
 */
export function getStoredE2BApiKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(E2B_API_KEY_STORAGE);
  } catch {
    return null;
  }
}

/**
 * Store E2B API key
 */
export function setStoredE2BApiKey(key: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (key) {
      localStorage.setItem(E2B_API_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(E2B_API_KEY_STORAGE);
    }
  } catch (error) {
    console.error("Failed to store E2B API key:", error);
  }
}

/**
 * Get all stored provider configurations
 */
export function getStoredProviders(): ProviderConfig[] {
  if (typeof window === "undefined") return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const configs = JSON.parse(stored) as ProviderConfig[];
    return configs;
  } catch (error) {
    console.error("Failed to load provider configs:", error);
    return [];
  }
}

/**
 * Save provider configurations to localStorage
 */
export function saveProviders(providers: ProviderConfig[]): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
  } catch (error) {
    console.error("Failed to save provider configs:", error);
  }
}

/**
 * Add a new provider configuration
 */
export function addProvider(config: Omit<ProviderConfig, "id" | "createdAt">): ProviderConfig {
  const providers = getStoredProviders();
  
  const newConfig: ProviderConfig = {
    ...config,
    id: generateId(),
    createdAt: Date.now(),
  };
  
  providers.push(newConfig);
  saveProviders(providers);
  
  return newConfig;
}

/**
 * Update an existing provider configuration
 */
export function updateProvider(id: string, updates: Partial<ProviderConfig>): ProviderConfig | null {
  const providers = getStoredProviders();
  const index = providers.findIndex(p => p.id === id);
  
  if (index === -1) return null;
  
  providers[index] = {
    ...providers[index],
    ...updates,
  };
  
  saveProviders(providers);
  return providers[index];
}

/**
 * Delete a provider configuration
 */
export function deleteProvider(id: string): boolean {
  const providers = getStoredProviders();
  const filtered = providers.filter(p => p.id !== id);
  
  if (filtered.length === providers.length) return false;
  
  saveProviders(filtered);
  
  // Clear active provider if it was deleted
  const activeId = getActiveProviderId();
  if (activeId === id) {
    setActiveProviderId(null);
  }
  
  return true;
}

/**
 * Get the currently active provider ID
 */
export function getActiveProviderId(): string | null {
  if (typeof window === "undefined") return null;
  
  try {
    return localStorage.getItem(ACTIVE_PROVIDER_KEY);
  } catch {
    return null;
  }
}

/**
 * Set the active provider ID
 */
export function setActiveProviderId(id: string | null): void {
  if (typeof window === "undefined") return;
  
  try {
    if (id) {
      localStorage.setItem(ACTIVE_PROVIDER_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_PROVIDER_KEY);
    }
  } catch (error) {
    console.error("Failed to set active provider:", error);
  }
}

/**
 * Get the active provider configuration
 */
export function getActiveProvider(): ProviderConfig | null {
  const activeId = getActiveProviderId();
  if (!activeId) return null;
  
  const providers = getStoredProviders();
  return providers.find(p => p.id === activeId) || null;
}

/**
 * Generate a unique ID for provider configs
 */
function generateId(): string {
  return `provider_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a default provider config from environment variables (server-side)
 */
export function createDefaultProviderFromEnv(type: ProviderType): ProviderConfig | null {
  // This is used server-side as fallback when no client config exists
  const envKeys: Record<ProviderType, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    groq: process.env.GROQ_API_KEY,
    mistral: process.env.MISTRAL_API_KEY,
    xai: process.env.XAI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    huggingface: process.env.HUGGINGFACE_API_KEY,
    ollama: undefined,
    custom: undefined,
  };
  
  const apiKey = envKeys[type];
  if (type !== "ollama" && type !== "custom" && !apiKey) return null;
  
  const defaultModels: Record<Exclude<ProviderType, "custom">, string> = {
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
  
  return {
    id: `default_${type}`,
    name: type.charAt(0).toUpperCase() + type.slice(1),
    type,
    apiKey: type === "ollama" ? undefined : apiKey,
    model: type !== "custom" ? defaultModels[type] : "",
    useNativeComputerUse: type === "openai" || type === "anthropic",
    isActive: true,
    createdAt: Date.now(),
  };
}

/**
 * React hook for provider management
 */
import { useState, useEffect, useCallback } from "react";

export function useProviders() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProvider, setActiveProvider] = useState<ProviderConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load providers on mount
  useEffect(() => {
    const stored = getStoredProviders();
    setProviders(stored);
    
    const active = getActiveProvider();
    setActiveProvider(active);
    setIsLoading(false);
  }, []);

  const add = useCallback((config: Omit<ProviderConfig, "id" | "createdAt">): ProviderConfig => {
    const newConfig = addProvider(config);
    setProviders((prev: ProviderConfig[]) => [...prev, newConfig]);
    return newConfig;
  }, []);

  const update = useCallback((id: string, updates: Partial<ProviderConfig>): ProviderConfig | null => {
    const updated = updateProvider(id, updates);
    if (updated) {
      setProviders((prev: ProviderConfig[]) => prev.map((p: ProviderConfig) => p.id === id ? updated : p));
      if (activeProvider?.id === id) {
        setActiveProvider(updated);
      }
    }
    return updated;
  }, [activeProvider]);

  const remove = useCallback((id: string): boolean => {
    const success = deleteProvider(id);
    if (success) {
      setProviders((prev: ProviderConfig[]) => prev.filter((p: ProviderConfig) => p.id !== id));
      if (activeProvider?.id === id) {
        setActiveProvider(null);
      }
    }
    return success;
  }, [activeProvider]);

  const setActive = useCallback((id: string | null) => {
    setActiveProviderId(id);
    if (id) {
      const provider = providers.find((p: ProviderConfig) => p.id === id);
      setActiveProvider(provider || null);
    } else {
      setActiveProvider(null);
    }
  }, [providers]);

  return {
    providers,
    activeProvider,
    isLoading,
    addProvider: add,
    updateProvider: update,
    deleteProvider: remove,
    setActiveProvider: setActive,
  };
}
