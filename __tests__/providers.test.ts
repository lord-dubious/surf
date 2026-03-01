import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const openRouterFactoryMock = vi.fn((model: string) => ({ provider: "openrouter", model }));
  const openRouterCreateMock = vi.fn(() => openRouterFactoryMock);

  const openAICompatibleFactoryMock = vi.fn((model: string) => ({ provider: "openai-compatible", model }));
  const openAICompatibleCreateMock = vi.fn(() => openAICompatibleFactoryMock);

  const huggingFaceFactoryMock = vi.fn((model: string) => ({ provider: "huggingface", model }));
  const huggingFaceCreateMock = vi.fn(() => huggingFaceFactoryMock);

  return {
    openRouterFactoryMock,
    openRouterCreateMock,
    openAICompatibleFactoryMock,
    openAICompatibleCreateMock,
    huggingFaceFactoryMock,
    huggingFaceCreateMock,
  };
});

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: mocks.openRouterCreateMock,
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: mocks.openAICompatibleCreateMock,
}));

vi.mock("@ai-sdk/huggingface", () => ({
  createHuggingFace: mocks.huggingFaceCreateMock,
}));

import { createProviderInstance } from "@/lib/providers";
import { hasVisionCapability } from "@/lib/providers/vision-detection";

describe("createProviderInstance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates OpenRouter provider with expected headers/apiKey and model", () => {
    const instance = createProviderInstance({
      id: "1",
      name: "openrouter",
      type: "openrouter",
      apiKey: "test-key",
      model: "google/gemini-2.0-flash-exp:free",
      useNativeComputerUse: false,
      createdAt: Date.now(),
    });

    expect(mocks.openRouterCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-key",
        headers: expect.objectContaining({
          "HTTP-Referer": expect.any(String),
          "X-Title": expect.any(String),
        }),
      }),
    );
    expect(mocks.openRouterFactoryMock).toHaveBeenCalledWith("google/gemini-2.0-flash-exp:free");
    expect(instance).toEqual({ provider: "openrouter", model: "google/gemini-2.0-flash-exp:free" });
  });

  it("creates Ollama provider with default baseURL", () => {
    const instance = createProviderInstance({
      id: "2",
      name: "ollama",
      type: "ollama",
      model: "llava",
      useNativeComputerUse: false,
      createdAt: Date.now(),
    });

    expect(mocks.openAICompatibleCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ollama", baseURL: "http://localhost:11434/v1" }),
    );
    expect(mocks.openAICompatibleFactoryMock).toHaveBeenCalledWith("llava");
    expect(instance).toEqual({ provider: "openai-compatible", model: "llava" });
  });

  it("throws for custom provider without baseURL", () => {
    expect(() =>
      createProviderInstance({
        id: "3",
        name: "custom",
        type: "custom",
        model: "some-model",
        useNativeComputerUse: false,
        createdAt: Date.now(),
      }),
    ).toThrow("Base URL is required for custom providers");
  });
});

describe("hasVisionCapability", () => {
  it.each([
    ["google/gemini-2.0-flash-exp:free", true],
    ["moonshotai/kimi-k2.5", true],
    ["meta-llama/llama-3.2-11b-vision-instruct:free", true],
    ["qwen/qwen2-vl-72b-instruct", true],
    ["mistralai/mistral-7b-instruct", false],
  ])("%s -> %s", (modelId, expected) => {
    expect(hasVisionCapability(modelId)).toBe(expected);
  });
});
