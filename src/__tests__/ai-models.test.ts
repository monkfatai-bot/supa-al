import { describe, it, expect } from "vitest";
import {
  AVAILABLE_MODELS,
  ENABLED_MODELS,
  getModelById,
  getModelsByProvider,
  getDefaultModel,
  getAvailableProviders,
  resolveProviderFromModel,
} from "@/services/ai/models";

describe("AI Models Registry", () => {
  it("has models from all 7 providers", () => {
    const providers = getAvailableProviders();
    expect(providers.length).toBe(7);
    expect(providers).toContain("openai");
    expect(providers).toContain("anthropic");
    expect(providers).toContain("google");
    expect(providers).toContain("deepseek");
    expect(providers).toContain("openrouter");
    expect(providers).toContain("qwen");
    expect(providers).toContain("grok");
  });

  it("has at least 2 models total", () => {
    expect(AVAILABLE_MODELS.length).toBeGreaterThanOrEqual(2);
  });

  it("all models have required metadata", () => {
    for (const model of AVAILABLE_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.provider).toBeTruthy();
      expect(model.description).toBeTruthy();
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.maxOutputTokens).toBeGreaterThan(0);
      expect(typeof model.costPerRequest).toBe("number");
      expect(typeof model.enabled).toBe("boolean");
      expect(model.capabilities).toBeDefined();
      expect(typeof model.capabilities.streaming).toBe("boolean");
      expect(typeof model.capabilities.functionCalling).toBe("boolean");
      expect(typeof model.capabilities.vision).toBe("boolean");
      expect(typeof model.capabilities.jsonMode).toBe("boolean");
    }
  });

  it("ENABLED_MODELS only contains enabled models", () => {
    for (const model of ENABLED_MODELS) {
      expect(model.enabled).toBe(true);
    }
  });

  it("getModelById returns correct model", () => {
    const model = getModelById("gpt-4o-mini");
    expect(model).toBeDefined();
    expect(model!.provider).toBe("openai");
    expect(model!.name).toBe("GPT-4o Mini");
  });

  it("getModelById returns undefined for unknown model", () => {
    expect(getModelById("nonexistent-model")).toBeUndefined();
  });

  it("getModelsByProvider filters correctly", () => {
    const openaiModels = getModelsByProvider("openai");
    expect(openaiModels.length).toBeGreaterThanOrEqual(1);
    for (const m of openaiModels) {
      expect(m.provider).toBe("openai");
    }
  });

  it("getDefaultModel returns an enabled model", () => {
    const model = getDefaultModel();
    expect(model.enabled).toBe(true);
    expect(model.id).toBeTruthy();
  });

  it("resolveProviderFromModel returns correct provider", () => {
    expect(resolveProviderFromModel("gpt-4o")).toBe("openai");
    expect(resolveProviderFromModel("claude-sonnet-4-20250514")).toBe("anthropic");
    expect(resolveProviderFromModel("gemini-2.5-flash")).toBe("google");
    expect(resolveProviderFromModel("deepseek-chat")).toBe("deepseek");
    expect(resolveProviderFromModel("openrouter/auto")).toBe("openrouter");
    expect(resolveProviderFromModel("qwen-turbo")).toBe("qwen");
    expect(resolveProviderFromModel("grok-3")).toBe("grok");
  });

  it("resolveProviderFromModel throws for unknown model", () => {
    expect(() => resolveProviderFromModel("nonexistent")).toThrow("Unknown model");
  });
});
