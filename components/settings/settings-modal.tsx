"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  PROVIDER_DISPLAY_NAMES, 
  ProviderType, 
  ProviderConfig,
  testProviderConnection,
  getProviderCapabilities,
  ModelInfo,
  BuiltinProviderType
} from "@/lib/providers";
import { fetchModelsAction } from "@/app/actions/models";
import { useProviders, getStoredE2BApiKey, setStoredE2BApiKey } from "@/lib/providers/store";
import { cn } from "@/lib/utils";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    providers,
    activeProvider,
    addProvider,
    updateProvider,
    deleteProvider,
    setActiveProvider,
    isLoading,
  } = useProviders();

  const [showAddForm, setShowAddForm] = React.useState(false);
  const [editingProvider, setEditingProvider] = React.useState<ProviderConfig | null>(null);
  const [testResult, setTestResult] = React.useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = React.useState(false);
  const [availableModels, setAvailableModels] = React.useState<ModelInfo[]>([]);
  const [e2bApiKey, setE2bApiKey] = React.useState<string>("");
  const [showE2bKey, setShowE2bKey] = React.useState(false);

  // Load E2B API key on mount
  React.useEffect(() => {
    const stored = getStoredE2BApiKey();
    if (stored) setE2bApiKey(stored);
  }, []);

  // Save E2B API key when it changes
  const handleE2bKeySave = React.useCallback(() => {
    setStoredE2BApiKey(e2bApiKey || null);
  }, [e2bApiKey]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[80vh] overflow-auto bg-bg-100 border border-border rounded-lg shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-bg-100 border-b border-border">
          <h2 className="text-lg font-mono uppercase tracking-wider">Provider Settings</h2>
          <Button variant="ghost" size="iconSm" onClick={onClose}>
            ✕
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Active Provider */}
          {activeProvider && (
            <div className="p-4 border border-accent/30 bg-accent/5 rounded">
              <div className="text-xs font-mono uppercase text-fg-300 mb-2">Active Provider</div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono">{activeProvider.name}</span>
                  <span className="text-fg-300 text-sm ml-2">({activeProvider.model})</span>
                </div>
                <span className="text-xs px-2 py-1 bg-accent/10 text-accent rounded">
                  {PROVIDER_DISPLAY_NAMES[activeProvider.type]}
                </span>
              </div>
            </div>
          )}

          {/* E2B API Key */}
          <div className="space-y-3">
            <div className="text-xs font-mono uppercase text-fg-300">E2B Sandbox API Key</div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showE2bKey ? "text" : "password"}
                  placeholder="e2b_xxx..."
                  value={e2bApiKey}
                  onChange={(e) => setE2bApiKey(e.target.value)}
                  onBlur={handleE2bKeySave}
                  className="pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowE2bKey(!showE2bKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-300 hover:text-fg-100"
                >
                  {showE2bKey ? "🙈" : "👁"}
                </button>
              </div>
              <Button variant="outline" onClick={handleE2bKeySave}>
                Save
              </Button>
            </div>
            <p className="text-xs text-fg-300">
              Required for sandbox creation. Get your key from{" "}
              <a href="https://e2b.dev" target="_blank" rel="noopener" className="text-accent hover:underline">
                e2b.dev
              </a>
            </p>
          </div>

          {/* Provider List */}
          <div className="space-y-3">
            <div className="text-xs font-mono uppercase text-fg-300">Configured Providers</div>
            
            {isLoading ? (
              <div className="text-fg-300">Loading...</div>
            ) : providers.length === 0 ? (
              <div className="text-fg-300 text-sm">No providers configured. Add one below.</div>
            ) : (
              <div className="space-y-2">
                {providers.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    isActive={activeProvider?.id === provider.id}
                    onEdit={() => setEditingProvider(provider)}
                    onDelete={() => deleteProvider(provider.id)}
                    onActivate={() => setActiveProvider(provider.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Add/Edit Form */}
          {(showAddForm || editingProvider) && (
            <ProviderForm
              provider={editingProvider}
              availableModels={availableModels}
              onModelsLoaded={setAvailableModels}
              onSave={(config) => {
                if (editingProvider) {
                  updateProvider(editingProvider.id, config);
                  setEditingProvider(null);
                } else {
                  const newProvider = addProvider(config);
                  setActiveProvider(newProvider.id);
                  setShowAddForm(false);
                }
              }}
              onCancel={() => {
                setShowAddForm(false);
                setEditingProvider(null);
                setAvailableModels([]);
              }}
              onTest={async (config) => {
                setIsTesting(true);
                setTestResult(null);
                const result = await testProviderConnection(config as ProviderConfig);
                setTestResult({
                  success: result.success,
                  message: result.success 
                    ? "Connection successful!" 
                    : result.error || "Connection failed",
                });
                if (result.models) {
                  setAvailableModels(result.models);
                }
                setIsTesting(false);
              }}
              isTesting={isTesting}
              testResult={testResult}
            />
          )}

          {/* Add Button */}
          {!showAddForm && !editingProvider && (
            <Button
              variant="outline"
              onClick={() => setShowAddForm(true)}
              className="w-full"
            >
              + Add Provider
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ProviderCardProps {
  provider: ProviderConfig;
  isActive: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onActivate: () => void;
}

function ProviderCard({ provider, isActive, onEdit, onDelete, onActivate }: ProviderCardProps) {
  return (
    <div className={cn(
      "flex items-center justify-between p-3 border rounded",
      isActive ? "border-accent/50 bg-accent/5" : "border-border bg-bg-200"
    )}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono">{provider.name}</span>
          <span className="text-xs px-2 py-0.5 bg-bg-300 text-fg-300 rounded">
            {PROVIDER_DISPLAY_NAMES[provider.type]}
          </span>
          {provider.useNativeComputerUse && (
            <span className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded">
              Native CU
            </span>
          )}
        </div>
        <div className="text-sm text-fg-300">{provider.model}</div>
      </div>
      
      <div className="flex items-center gap-2">
        {!isActive && (
          <Button variant="muted" size="sm" onClick={onActivate}>
            Activate
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-error hover:text-error">
          Delete
        </Button>
      </div>
    </div>
  );
}

interface ProviderFormProps {
  provider: ProviderConfig | null;
  availableModels: ModelInfo[];
  onModelsLoaded: (models: ModelInfo[]) => void;
  onSave: (config: Omit<ProviderConfig, "id" | "createdAt">) => void;
  onCancel: () => void;
  onTest: (config: Partial<ProviderConfig>) => Promise<void>;
  isTesting: boolean;
  testResult: { success: boolean; message: string } | null;
}

function ProviderForm({
  provider,
  availableModels,
  onModelsLoaded,
  onSave,
  onCancel,
  onTest,
  isTesting,
  testResult,
}: ProviderFormProps) {
  const [name, setName] = React.useState(provider?.name || "");
  const [type, setType] = React.useState<ProviderType>(provider?.type || "openai");
  const [apiKey, setApiKey] = React.useState(provider?.apiKey || "");
  const [baseUrl, setBaseUrl] = React.useState(provider?.baseUrl || "");
  const [model, setModel] = React.useState(provider?.model || "");
  const [useNativeComputerUse, setUseNativeComputerUse] = React.useState(
    provider?.useNativeComputerUse ?? false
  );

  const isCustom = type === "custom";
  const capabilities = getProviderCapabilities(type, model);
  const isBuiltin = type !== "custom";
  const [isLoadingModels, setIsLoadingModels] = React.useState(false);
  const [modelLoadError, setModelLoadError] = React.useState<string | null>(null);

  // Reset models when provider type changes
  React.useEffect(() => {
    if (availableModels.length > 0) {
      onModelsLoaded([]);
    }
  }, [type, onModelsLoaded, availableModels.length]);

  // Fetch models for the current provider using server action
  const fetchModels = React.useCallback(async () => {
    if (apiKey.length < 10) return;
    
    setIsLoadingModels(true);
    setModelLoadError(null);
    try {
      const result = await fetchModelsAction(
        apiKey,
        isCustom ? "custom" : "builtin",
        isCustom ? undefined : (type as BuiltinProviderType),
        isCustom ? baseUrl : undefined
      );
      
      if (result.success && result.models.length > 0) {
        onModelsLoaded(result.models);
        setModelLoadError(null);
      } else if (result.error) {
        console.error("Failed to fetch models:", result.error);
        setModelLoadError(result.error);
      } else if (result.models.length === 0) {
        setModelLoadError("No models found");
      }
    } catch (error) {
      console.error("Failed to fetch models:", error);
      setModelLoadError(error instanceof Error ? error.message : "Failed to fetch models");
    } finally {
      setIsLoadingModels(false);
    }
  }, [type, apiKey, baseUrl, isCustom, onModelsLoaded]);

  // Auto-fetch models when API key changes (on blur)
  const handleApiKeyBlur = React.useCallback(async () => {
    fetchModels();
  }, [fetchModels]);

  // Fetch models when focusing on model input
  const handleModelFocus = React.useCallback(async () => {
    if (availableModels.length === 0) {
      fetchModels();
    }
  }, [availableModels.length, fetchModels]);

  // Fetch models when base URL changes for custom providers
  React.useEffect(() => {
    if (isCustom && baseUrl && apiKey.length > 10) {
      fetchModels();
    }
  }, [baseUrl, isCustom, apiKey.length, fetchModels]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: name || PROVIDER_DISPLAY_NAMES[type],
      type,
      apiKey,
      baseUrl: isCustom ? baseUrl : undefined,
      model,
      useNativeComputerUse,
      isActive: true,
    });
  };

  const handleTest = () => {
    onTest({
      type,
      apiKey,
      baseUrl: isCustom ? baseUrl : undefined,
      model,
    });
  };

  // Auto-detect native computer use support
  React.useEffect(() => {
    if (capabilities.hasNativeComputerUse) {
      setUseNativeComputerUse(true);
    }
  }, [capabilities.hasNativeComputerUse]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-border rounded bg-bg-200">
      <div className="text-sm font-mono uppercase text-fg-300 mb-4">
        {provider ? "Edit Provider" : "Add Provider"}
      </div>

      {/* Provider Type */}
      <div className="space-y-2">
        <label className="text-xs font-mono uppercase text-fg-300">Provider Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ProviderType)}
          className="w-full h-8 px-3 bg-bg-100 border border-border rounded text-fg"
        >
          {Object.entries(PROVIDER_DISPLAY_NAMES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <label className="text-xs font-mono uppercase text-fg-300">Display Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={PROVIDER_DISPLAY_NAMES[type]}
        />
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <label className="text-xs font-mono uppercase text-fg-300">API Key</label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onBlur={handleApiKeyBlur}
          placeholder="Enter your API key"
        />
      </div>

      {/* Base URL (for custom providers) */}
      {isCustom && (
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase text-fg-300">Base URL</label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>
      )}

      {/* Model Selection */}
      <div className="space-y-2">
        <label className="text-xs font-mono uppercase text-fg-300">Model</label>
        {isLoadingModels ? (
          <div className="w-full h-8 px-3 bg-bg-100 border border-border rounded flex items-center text-fg-300 text-sm">
            Loading models...
          </div>
        ) : availableModels.length > 0 ? (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full h-8 px-3 bg-bg-100 border border-border rounded text-fg"
          >
            <option value="">Select a model</option>
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.id}
              </option>
            ))}
          </select>
        ) : (
          <div className="space-y-1">
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onFocus={handleModelFocus}
              placeholder={
                isCustom 
                  ? baseUrl && apiKey.length > 10 
                    ? "Click to load models..." 
                    : "Enter base URL and API key first"
                  : apiKey.length > 10 
                    ? "Click to load models..." 
                    : "Enter API key first"
              }
            />
            {isCustom && baseUrl && apiKey.length > 10 && (
              <button
                type="button"
                onClick={handleModelFocus}
                className="text-xs text-accent hover:underline"
              >
                Load models from endpoint
              </button>
            )}
            {modelLoadError && (
              <p className="text-xs text-error">{modelLoadError}</p>
            )}
          </div>
        )}
      </div>

      {/* Native Computer Use Toggle */}
      {capabilities.hasNativeComputerUse && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="nativeCU"
            checked={useNativeComputerUse}
            onChange={(e) => setUseNativeComputerUse(e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="nativeCU" className="text-sm text-fg-300">
            Use native computer-use (OpenAI Responses API / Anthropic computer tools)
          </label>
        </div>
      )}

      {/* Test Result */}
      {testResult && (
        <div className={cn(
          "p-2 rounded text-sm",
          testResult.success ? "bg-accent/10 text-accent" : "bg-error/10 text-error"
        )}>
          {testResult.message}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={!apiKey || !model}>
          {provider ? "Update" : "Add Provider"}
        </Button>
        <Button type="button" variant="outline" onClick={handleTest} loading={isTesting}>
          Test Connection
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default SettingsModal;
