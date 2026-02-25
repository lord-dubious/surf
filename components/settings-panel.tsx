"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Settings, RefreshCw, Check, X, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChat } from "@/lib/chat-context";
import { ComputerModel, ModelInfo } from "@/types/api";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { OpenAiLogo } from "@phosphor-icons/react";
import { AnthropicLogo } from "./icons";

const STORAGE_KEY_BASE_URL = "surf_openai_compatible_base_url";
const STORAGE_KEY_API_KEY = "surf_openai_compatible_api_key";
const STORAGE_KEY_MODEL_ID = "surf_openai_compatible_model_id";

export function SettingsPanel() {
  const { model, setModel, setOpenaiCompatibleConfig } = useChat();
  const [isOpen, setIsOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Load saved settings from localStorage on mount
  useEffect(() => {
    const savedBaseUrl = localStorage.getItem(STORAGE_KEY_BASE_URL) || "";
    const savedApiKey = localStorage.getItem(STORAGE_KEY_API_KEY) || "";
    const savedModelId = localStorage.getItem(STORAGE_KEY_MODEL_ID) || "";

    setBaseUrl(savedBaseUrl);
    setApiKey(savedApiKey);
    setModelId(savedModelId);

    if (savedBaseUrl && savedApiKey && savedModelId) {
      setModel("openai-compatible");
      setOpenaiCompatibleConfig({
        baseUrl: savedBaseUrl,
        apiKey: savedApiKey,
        modelId: savedModelId,
      });
    }
  }, [setModel, setOpenaiCompatibleConfig]);

  // Save settings to localStorage when they change
  const saveSettings = useCallback(() => {
    localStorage.setItem(STORAGE_KEY_BASE_URL, baseUrl);
    localStorage.setItem(STORAGE_KEY_API_KEY, apiKey);
    localStorage.setItem(STORAGE_KEY_MODEL_ID, modelId);

    if (baseUrl && apiKey && modelId) {
      setModel("openai-compatible");
      setOpenaiCompatibleConfig({
        baseUrl,
        apiKey,
        modelId,
      });
      toast.success(`Settings saved. Using model: ${modelId}`);
    }
  }, [baseUrl, apiKey, modelId, setModel, setOpenaiCompatibleConfig]);

  const fetchModels = useCallback(async () => {
    if (!baseUrl || !apiKey) {
      toast.error("Please enter both Base URL and API Key first");
      return;
    }

    setIsLoadingModels(true);
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch models");
      }

      const data = await response.json();
      setModels(data.models || []);

      if (data.models && data.models.length > 0) {
        toast.success(`Found ${data.models.length} models`);
      } else {
        toast.error("No models found at this endpoint");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to fetch models"
      );
      setModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  }, [baseUrl, apiKey]);

  const handleProviderChange = (value: string) => {
    const newModel = value as ComputerModel;
    setModel(newModel);

    if (newModel === "openai-compatible" && baseUrl && apiKey && modelId) {
      setOpenaiCompatibleConfig({ baseUrl, apiKey, modelId });
    } else if (newModel !== "openai-compatible") {
      setOpenaiCompatibleConfig(null);
    }
  };

  const clearCustomSettings = () => {
    setBaseUrl("");
    setApiKey("");
    setModelId("");
    setModels([]);
    localStorage.removeItem(STORAGE_KEY_BASE_URL);
    localStorage.removeItem(STORAGE_KEY_API_KEY);
    localStorage.removeItem(STORAGE_KEY_MODEL_ID);
    setModel("openai");
    setOpenaiCompatibleConfig(null);
    toast.success("Custom provider settings cleared");
  };

  return (
    <div className="relative">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant={model === "openai-compatible" ? "accent" : "outline"}
        size="icon"
        title="Provider Settings"
      >
        <Settings className="h-5 w-5" />
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 z-50 w-[360px] bg-bg border border-border-200 rounded-lg shadow-xl p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-mono uppercase tracking-wider text-fg-300">
                Provider Settings
              </h3>
              <Button
                onClick={() => setIsOpen(false)}
                variant="ghost"
                size="icon"
                className="h-6 w-6"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Provider Selection */}
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase tracking-wider text-fg-300">
                Provider
              </label>
              <Select value={model} onValueChange={handleProviderChange}>
                <SelectTrigger className="h-10">
                  <div className="flex items-center gap-2">
                    {model === "openai" && <OpenAiLogo className="size-4" />}
                    {model === "anthropic" && (
                      <AnthropicLogo className="size-4" />
                    )}
                    {model === "openai-compatible" && (
                      <Settings className="size-4" />
                    )}
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Built-in Providers</SelectLabel>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Custom</SelectLabel>
                    <SelectItem value="openai-compatible">
                      OpenAI-Compatible
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Provider Configuration */}
            <AnimatePresence>
              {model === "openai-compatible" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3 overflow-hidden"
                >
                  {/* Base URL */}
                  <div className="space-y-1">
                    <label className="text-xs font-mono uppercase tracking-wider text-fg-300">
                      Base URL
                    </label>
                    <input
                      type="url"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://api.example.com/v1"
                      className={cn(
                        "w-full h-10 px-3 bg-bg-300/60",
                        "text-fg text-sm rounded-md",
                        "border border-border-200",
                        "font-mono tracking-wide",
                        "outline-none transition-all duration-200",
                        "placeholder:text-fg-300",
                        "focus:border-accent"
                      )}
                    />
                  </div>

                  {/* API Key */}
                  <div className="space-y-1">
                    <label className="text-xs font-mono uppercase tracking-wider text-fg-300">
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-..."
                        className={cn(
                          "w-full h-10 px-3 pr-10 bg-bg-300/60",
                          "text-fg text-sm rounded-md",
                          "border border-border-200",
                          "font-mono tracking-wide",
                          "outline-none transition-all duration-200",
                          "placeholder:text-fg-300",
                          "focus:border-accent"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-300 hover:text-fg transition-colors"
                      >
                        {showApiKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Model Selection */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono uppercase tracking-wider text-fg-300">
                        Model
                      </label>
                      <Button
                        onClick={fetchModels}
                        variant="ghost"
                        size="sm"
                        disabled={isLoadingModels || !baseUrl || !apiKey}
                        className="h-6 px-2 text-xs"
                        title="Fetch models from provider"
                      >
                        <RefreshCw
                          className={cn(
                            "h-3 w-3 mr-1",
                            isLoadingModels && "animate-spin"
                          )}
                        />
                        {isLoadingModels ? "Loading..." : "Fetch Models"}
                      </Button>
                    </div>

                    {models.length > 0 ? (
                      <Select
                        value={modelId}
                        onValueChange={(value) => setModelId(value)}
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>
                              Available Models ({models.length})
                            </SelectLabel>
                            {models.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.id}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : (
                      <input
                        type="text"
                        value={modelId}
                        onChange={(e) => setModelId(e.target.value)}
                        placeholder="model-name or fetch from provider"
                        className={cn(
                          "w-full h-10 px-3 bg-bg-300/60",
                          "text-fg text-sm rounded-md",
                          "border border-border-200",
                          "font-mono tracking-wide",
                          "outline-none transition-all duration-200",
                          "placeholder:text-fg-300",
                          "focus:border-accent"
                        )}
                      />
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      onClick={saveSettings}
                      variant="accent"
                      size="sm"
                      disabled={!baseUrl || !apiKey || !modelId}
                      className="flex-1"
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Save & Apply
                    </Button>
                    <Button
                      onClick={clearCustomSettings}
                      variant="muted"
                      size="sm"
                    >
                      Clear
                    </Button>
                  </div>

                  {/* Current Config Status */}
                  {baseUrl && apiKey && modelId && (
                    <div className="text-xs text-fg-300 font-mono p-2 bg-bg-200 rounded border border-border-200">
                      <div className="truncate">
                        <span className="text-fg-400">URL:</span> {baseUrl}
                      </div>
                      <div className="truncate">
                        <span className="text-fg-400">Model:</span> {modelId}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
