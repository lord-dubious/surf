/**
 * Provider configuration types for AI SDK integration
 */

export type BuiltinProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "mistral"
  | "xai"
  | "openrouter"
  | "huggingface"
  | "ollama";

export type CustomProviderType = "custom";

export type ProviderType = BuiltinProviderType | CustomProviderType;

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  useNativeComputerUse: boolean;
  isActive?: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

export function providerRequiresApiKey(type: ProviderType): boolean {
  return !["custom", "ollama"].includes(type);
}

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

export interface ModelInfo {
  id: string;
  name?: string;
  ownedBy?: string;
  hasVision?: boolean;
  contextLength?: number;
}

export interface ProviderCapabilities {
  hasVision: boolean;
  hasNativeComputerUse: boolean;
  hasToolCalling: boolean;
  hasStreaming: boolean;
}

export const BUILTIN_PROVIDER_CAPABILITIES: Record<BuiltinProviderType, ProviderCapabilities> = {
  openai: { hasVision: true, hasNativeComputerUse: true, hasToolCalling: true, hasStreaming: true },
  anthropic: { hasVision: true, hasNativeComputerUse: true, hasToolCalling: true, hasStreaming: true },
  google: { hasVision: true, hasNativeComputerUse: false, hasToolCalling: true, hasStreaming: true },
  groq: { hasVision: true, hasNativeComputerUse: false, hasToolCalling: true, hasStreaming: true },
  mistral: { hasVision: true, hasNativeComputerUse: false, hasToolCalling: true, hasStreaming: true },
  xai: { hasVision: true, hasNativeComputerUse: false, hasToolCalling: true, hasStreaming: true },
  openrouter: { hasVision: true, hasNativeComputerUse: false, hasToolCalling: true, hasStreaming: true },
  huggingface: { hasVision: true, hasNativeComputerUse: false, hasToolCalling: false, hasStreaming: true },
  ollama: { hasVision: true, hasNativeComputerUse: false, hasToolCalling: true, hasStreaming: true },
};

export const NATIVE_COMPUTER_USE_MODELS = [
  "computer-use-preview",
  "claude-3-5-sonnet",
  "claude-3-6-sonnet",
  "claude-3-7-sonnet",
  "claude-sonnet-4",
] as const;

export function supportsNativeComputerUse(modelId: string): boolean {
  return NATIVE_COMPUTER_USE_MODELS.some((m) => modelId.toLowerCase().includes(m.toLowerCase()));
}
