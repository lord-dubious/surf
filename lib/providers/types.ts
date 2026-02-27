/**
 * Provider configuration types for AI SDK integration
 */

/**
 * Built-in provider types supported by the AI SDK
 */
export type BuiltinProviderType = 
  | "openai" 
  | "anthropic" 
  | "google" 
  | "groq" 
  | "mistral" 
  | "xai";

/**
 * Custom provider for OpenAI-compatible endpoints
 */
export type CustomProviderType = "custom";

/**
 * All supported provider types
 */
export type ProviderType = BuiltinProviderType | CustomProviderType;

/**
 * Provider configuration stored in localStorage
 */
export interface ProviderConfig {
  /** Unique identifier for this provider configuration */
  id: string;
  /** Display name for the provider */
  name: string;
  /** Provider type - determines which AI SDK package to use */
  type: ProviderType;
  /** API key for authentication */
  apiKey?: string;
  /** Base URL for custom providers (OpenAI-compatible endpoints) */
  baseUrl?: string;
  /** Selected model ID */
  model: string;
  /** Whether to use native computer-use (OpenAI Responses API / Anthropic computer tools) */
  useNativeComputerUse: boolean;
  /** Whether this is the currently active provider */
  isActive?: boolean;
  /** Creation timestamp */
  createdAt: number;
  /** Last used timestamp */
  lastUsedAt?: number;
}

/**
 * Whether a provider requires an API key to authenticate
 */
export function providerRequiresApiKey(type: ProviderType): boolean {
  return type !== "custom";
}

/**
 * Validate provider configuration for required fields
 */
export function validateProviderConfig(config: ProviderConfig): string | null {
  if (!config.model) {
    return "Model is required for provider";
  }

  if (config.type === "custom" && !config.baseUrl) {
    return "Base URL is required for custom providers";
  }

  if (providerRequiresApiKey(config.type) && !config.apiKey) {
    return "API key is required for provider";
  }

  return null;
}

/**
 * Model information returned from dynamic model discovery
 */
export interface ModelInfo {
  id: string;
  name?: string;
  ownedBy?: string;
}

/**
 * Provider capability flags
 */
export interface ProviderCapabilities {
  /** Supports vision/image inputs */
  hasVision: boolean;
  /** Supports native computer use (OpenAI Responses / Anthropic computer tools) */
  hasNativeComputerUse: boolean;
  /** Supports function/tool calling */
  hasToolCalling: boolean;
  /** Supports streaming */
  hasStreaming: boolean;
}

/**
 * Built-in provider capability mappings
 */
export const BUILTIN_PROVIDER_CAPABILITIES: Record<BuiltinProviderType, ProviderCapabilities> = {
  openai: {
    hasVision: true,
    hasNativeComputerUse: true,
    hasToolCalling: true,
    hasStreaming: true,
  },
  anthropic: {
    hasVision: true,
    hasNativeComputerUse: true,
    hasToolCalling: true,
    hasStreaming: true,
  },
  google: {
    hasVision: true,
    hasNativeComputerUse: false,
    hasToolCalling: true,
    hasStreaming: true,
  },
  groq: {
    hasVision: true,
    hasNativeComputerUse: false,
    hasToolCalling: true,
    hasStreaming: true,
  },
  mistral: {
    hasVision: true,
    hasNativeComputerUse: false,
    hasToolCalling: true,
    hasStreaming: true,
  },
  xai: {
    hasVision: true,
    hasNativeComputerUse: false,
    hasToolCalling: true,
    hasStreaming: true,
  },
};

/**
 * Models known to support native computer use
 */
export const NATIVE_COMPUTER_USE_MODELS = [
  "computer-use-preview",
  "claude-3-5-sonnet",
  "claude-3-6-sonnet",
  "claude-3-7-sonnet",
  "claude-sonnet-4",
] as const;

/**
 * Check if a model supports native computer use
 */
export function supportsNativeComputerUse(modelId: string): boolean {
  return NATIVE_COMPUTER_USE_MODELS.some((m) => 
    modelId.toLowerCase().includes(m.toLowerCase())
  );
}
