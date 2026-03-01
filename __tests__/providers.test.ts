import { describe, expect, it } from "vitest";
import { createProviderInstance } from "@/lib/providers";
import { hasVisionCapability } from "@/lib/providers/vision-detection";

describe("createProviderInstance", () => {
  it("creates OpenRouter provider without throwing", () => {
    expect(() =>
      createProviderInstance({
        id: "1",
        name: "openrouter",
        type: "openrouter",
        apiKey: "test-key",
        model: "google/gemini-2.0-flash-exp:free",
        useNativeComputerUse: false,
        createdAt: Date.now(),
      }),
    ).not.toThrow();
  });

  it("creates Ollama provider with default baseURL", () => {
    expect(() =>
      createProviderInstance({
        id: "2",
        name: "ollama",
        type: "ollama",
        model: "llava",
        useNativeComputerUse: false,
        createdAt: Date.now(),
      }),
    ).not.toThrow();
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
