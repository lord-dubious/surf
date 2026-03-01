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
  BuiltinProviderType,
  providerRequiresApiKey,
} from "@/lib/providers";
import { fetchModelsAction } from "@/app/actions/models";
import { useProviders, getStoredE2BApiKey, setStoredE2BApiKey, MODEL_PRESETS } from "@/lib/providers/store";
import { cn } from "@/lib/utils";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProviderFormDefaults {
  type: ProviderType;
  model: string;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { providers, activeProvider, addProvider, updateProvider, deleteProvider, setActiveProvider, isLoading } = useProviders();

  const [showAddForm, setShowAddForm] = React.useState(false);
  const [editingProvider, setEditingProvider] = React.useState<ProviderConfig | null>(null);
  const [testResult, setTestResult] = React.useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = React.useState(false);
  const [availableModels, setAvailableModels] = React.useState<ModelInfo[]>([]);
  const [defaultValues, setDefaultValues] = React.useState<ProviderFormDefaults | null>(null);
  const [e2bApiKey, setE2bApiKey] = React.useState<string>("");
  const [showE2bKey, setShowE2bKey] = React.useState(false);

  React.useEffect(() => {
    const stored = getStoredE2BApiKey();
    if (stored) setE2bApiKey(stored);
  }, []);

  const handleE2bKeySave = React.useCallback(() => {
    setStoredE2BApiKey(e2bApiKey || null);
  }, [e2bApiKey]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[80vh] overflow-auto bg-bg-100 border border-border rounded-lg shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-bg-100 border-b border-border">
          <h2 className="text-lg font-mono uppercase tracking-wider">Provider Settings</h2>
          <Button variant="ghost" size="iconSm" onClick={onClose}>✕</Button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2 mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-400">Quick Start</p>
            <div className="flex flex-wrap gap-2">
              {MODEL_PRESETS.map((preset) => (
                <button
                  key={`${preset.type}-${preset.model || preset.label}`}
                  title={preset.hint}
                  onClick={() => {
                    setShowAddForm(true);
                    setEditingProvider(null);
                    setDefaultValues({ type: preset.type, model: preset.model });
                  }}
                  className="text-xs px-2 py-1 border border-border rounded hover:bg-bg-200 font-mono"
                >
                  + {preset.label}
                </button>
              ))}
            </div>
          </div>

          {activeProvider && (
            <div className="p-4 border border-accent/30 bg-accent/5 rounded">
              <div className="text-xs font-mono uppercase text-fg-300 mb-2">Active Provider</div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono">{activeProvider.name}</span>
                  <span className="text-fg-300 text-sm ml-2">({activeProvider.model})</span>
                </div>
                <span className="text-xs px-2 py-1 bg-accent/10 text-accent rounded">{PROVIDER_DISPLAY_NAMES[activeProvider.type]}</span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-xs font-mono uppercase text-fg-300">E2B Sandbox API Key</div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input type={showE2bKey ? "text" : "password"} placeholder="e2b_xxx..." value={e2bApiKey} onChange={(e) => setE2bApiKey(e.target.value)} onBlur={handleE2bKeySave} className="pr-10 font-mono" />
                <button type="button" onClick={() => setShowE2bKey(!showE2bKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-300 hover:text-fg-100">{showE2bKey ? "🙈" : "👁"}</button>
              </div>
              <Button variant="outline" onClick={handleE2bKeySave}>Save</Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-mono uppercase text-fg-300">Configured Providers</div>
            {isLoading ? (
              <div className="text-fg-300">Loading...</div>
            ) : providers.length === 0 ? (
              <div className="text-fg-300 text-sm">No providers configured. Add one below.</div>
            ) : (
              <div className="space-y-2">
                {providers.map((provider) => (
                  <ProviderCard key={provider.id} provider={provider} isActive={activeProvider?.id === provider.id} onEdit={() => setEditingProvider(provider)} onDelete={() => deleteProvider(provider.id)} onActivate={() => setActiveProvider(provider.id)} />
                ))}
              </div>
            )}
          </div>

          {(showAddForm || editingProvider) && (
            <ProviderForm
              provider={editingProvider}
              defaults={defaultValues}
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
                setDefaultValues(null);
              }}
              onCancel={() => {
                setShowAddForm(false);
                setEditingProvider(null);
                setAvailableModels([]);
                setDefaultValues(null);
              }}
              onTest={async (config) => {
                setIsTesting(true);
                setTestResult(null);
                const result = await testProviderConnection(config as ProviderConfig);
                setTestResult({ success: result.success, message: result.success ? "Connection successful!" : result.error || "Connection failed" });
                if (result.models) setAvailableModels(result.models);
                setIsTesting(false);
              }}
              isTesting={isTesting}
              testResult={testResult}
            />
          )}

          {!showAddForm && !editingProvider && (
            <Button variant="outline" onClick={() => setShowAddForm(true)} className="w-full">+ Add Provider</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ provider, isActive, onEdit, onDelete, onActivate }: { provider: ProviderConfig; isActive: boolean; onEdit: () => void; onDelete: () => void; onActivate: () => void }) {
  return (
    <div className={cn("flex items-center justify-between p-3 border rounded", isActive ? "border-accent/50 bg-accent/5" : "border-border bg-bg-200")}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono">{provider.name}</span>
          <span className="text-xs px-2 py-0.5 bg-bg-300 text-fg-300 rounded">{PROVIDER_DISPLAY_NAMES[provider.type]}</span>
        </div>
        <div className="text-sm text-fg-300">{provider.model}</div>
      </div>
      <div className="flex items-center gap-2">
        {!isActive && <Button variant="muted" size="sm" onClick={onActivate}>Activate</Button>}
        <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-error hover:text-error">Delete</Button>
      </div>
    </div>
  );
}

function ProviderForm({ provider, defaults, availableModels, onModelsLoaded, onSave, onCancel, onTest, isTesting, testResult }: {
  provider: ProviderConfig | null;
  defaults: ProviderFormDefaults | null;
  availableModels: ModelInfo[];
  onModelsLoaded: (models: ModelInfo[]) => void;
  onSave: (config: Omit<ProviderConfig, "id" | "createdAt">) => void;
  onCancel: () => void;
  onTest: (config: Partial<ProviderConfig>) => Promise<void>;
  isTesting: boolean;
  testResult: { success: boolean; message: string } | null;
}) {
  const [name, setName] = React.useState(provider?.name || "");
  const [type, setType] = React.useState<ProviderType>(provider?.type || defaults?.type || "openai");
  const [apiKey, setApiKey] = React.useState(provider?.apiKey || "");
  const [baseUrl, setBaseUrl] = React.useState(provider?.baseUrl || (defaults?.type === "ollama" ? "http://localhost:11434/v1" : ""));
  const [model, setModel] = React.useState(provider?.model || defaults?.model || "");
  const [useNativeComputerUse, setUseNativeComputerUse] = React.useState(provider?.useNativeComputerUse ?? false);
  const [isLoadingModels, setIsLoadingModels] = React.useState(false);
  const [modelLoadError, setModelLoadError] = React.useState<string | null>(null);

  const requiresApiKey = providerRequiresApiKey(type);
  const showApiKey = type !== "ollama";
  const showBaseUrl = type === "custom" || type === "ollama";
  const showLoadModels = ["openrouter", "huggingface", "ollama", "custom"].includes(type);
  const canFetchModels = !requiresApiKey || apiKey.trim().length > 0;
  const capabilities = getProviderCapabilities(type, model);
  const selectedModel = availableModels.find((m) => m.id === model);

  const fetchModels = React.useCallback(async () => {
    if (!canFetchModels && type !== "ollama") return;
    setIsLoadingModels(true);
    setModelLoadError(null);
    const result = await fetchModelsAction(apiKey || undefined, type === "custom" ? "custom" : "builtin", type === "custom" ? undefined : (type as BuiltinProviderType), showBaseUrl ? baseUrl : undefined);
    if (result.success) {
      onModelsLoaded(result.models);
      if (result.models.length === 0) setModelLoadError("No models found");
    } else {
      setModelLoadError(result.error || "Failed to load models");
    }
    setIsLoadingModels(false);
  }, [apiKey, baseUrl, canFetchModels, onModelsLoaded, showBaseUrl, type]);

  const prevTypeRef = React.useRef(type);
  React.useEffect(() => {
    if (prevTypeRef.current !== type) {
      onModelsLoaded([]);
      prevTypeRef.current = type;
    }
  }, [type, onModelsLoaded]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave({
      name: name || PROVIDER_DISPLAY_NAMES[type],
      type,
      apiKey: apiKey || undefined,
      baseUrl: showBaseUrl ? baseUrl : undefined,
      model,
      useNativeComputerUse,
      isActive: true,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-border rounded bg-bg-200">
      <div className="space-y-2">
        <label className="text-xs font-mono uppercase text-fg-300">Provider Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as ProviderType)} className="w-full h-8 px-3 bg-bg-100 border border-border rounded text-fg">
          {Object.entries(PROVIDER_DISPLAY_NAMES).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-mono uppercase text-fg-300">Display Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={PROVIDER_DISPLAY_NAMES[type]} />
      </div>

      {showApiKey && (
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase text-fg-300">API Key {type === "custom" ? "(optional)" : ""}</label>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter your API key" />
        </div>
      )}

      {showBaseUrl && (
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase text-fg-300">Base URL</label>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={type === "ollama" ? "http://localhost:11434/v1" : "https://api.example.com/v1"} />
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs font-mono uppercase text-fg-300">Model</label>
        {availableModels.length > 0 ? (
          <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full h-8 px-3 bg-bg-100 border border-border rounded text-fg">
            <option value="">Select a model</option>
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>{m.hasVision ? "👁 " : ""}{m.name || m.id}</option>
            ))}
          </select>
        ) : (
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model id" />
        )}
        {showLoadModels && (
          <Button type="button" variant="outline" onClick={fetchModels} disabled={isLoadingModels || (!canFetchModels && type !== "ollama")}>
            {isLoadingModels ? "Loading..." : "Load Models"}
          </Button>
        )}
        {modelLoadError && <p className="text-xs text-error">{modelLoadError}</p>}
        {selectedModel && selectedModel.hasVision === false && (
          <div className="text-xs text-amber-500 flex items-center gap-1 mt-1">
            <span>⚠️</span>
            <span>This model may not support vision. Choose a model marked with 👁 for best results.</span>
          </div>
        )}
      </div>

      {capabilities.hasNativeComputerUse && (
        <div className="flex items-center gap-2">
          <input type="checkbox" id="nativeCU" checked={useNativeComputerUse} onChange={(e) => setUseNativeComputerUse(e.target.checked)} className="w-4 h-4" />
          <label htmlFor="nativeCU" className="text-sm text-fg-300">Use native computer-use</label>
        </div>
      )}

      {testResult && (
        <div className={cn("p-2 rounded text-sm", testResult.success ? "bg-accent/10 text-accent" : "bg-error/10 text-error")}>{testResult.message}</div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={(requiresApiKey && !apiKey.trim()) || !model}>{provider ? "Update" : "Add Provider"}</Button>
        <Button type="button" variant="outline" onClick={() => onTest({ type, apiKey, baseUrl, model })} loading={isTesting}>Test Connection</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export default SettingsModal;
