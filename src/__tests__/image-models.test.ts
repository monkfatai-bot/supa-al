import { describe, it, expect } from "vitest";
import {
  AVAILABLE_IMAGE_MODELS,
  getImageModelById,
  getDefaultImageModel,
  getEnabledImageModels,
  getImageModelsByProvider,
  getImageProviders,
  resolveImageProvider,
} from "@/services/image/models";
import { IMAGE_STYLE_PRESETS, ASPECT_RATIO_SIZE_MAP, DEFAULT_IMAGE_SETTINGS } from "@/services/image/types";
import type { ImageSize, AspectRatio } from "@/services/image/types";

describe("Image Models Registry", () => {
  it("has models from 6 providers", () => {
    const providers = getImageProviders();
    expect(providers.length).toBe(6);
    expect(providers).toContain("openai");
    expect(providers).toContain("stability");
    expect(providers).toContain("replicate");
    expect(providers).toContain("ideogram");
    expect(providers).toContain("fal");
    expect(providers).toContain("google-image");
  });

  it("has at least 10 models total", () => {
    expect(AVAILABLE_IMAGE_MODELS.length).toBeGreaterThanOrEqual(10);
  });

  it("all models have required metadata", () => {
    for (const model of AVAILABLE_IMAGE_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.provider).toBeTruthy();
      expect(model.description).toBeTruthy();
      expect(model.supportedSizes.length).toBeGreaterThan(0);
      expect(model.supportedAspectRatios.length).toBeGreaterThan(0);
      expect(model.supportedGenerationTypes.length).toBeGreaterThan(0);
      expect(typeof model.creditCost).toBe("number");
      expect(model.creditCost).toBeGreaterThan(0);
      expect(typeof model.enabled).toBe("boolean");
      expect(model.maxNumImages).toBeGreaterThanOrEqual(1);
    }
  });

  it("all models have correct provider resolution", () => {
    const providers = getImageProviders();
    for (const model of AVAILABLE_IMAGE_MODELS) {
      expect(providers).toContain(model.provider);
    }
  });

  it("getImageModelById returns correct model", () => {
    const model = getImageModelById("dall-e-3");
    expect(model).toBeDefined();
    expect(model!.provider).toBe("openai");
    expect(model!.name).toBe("DALL-E 3");
  });

  it("getImageModelById returns undefined for unknown model", () => {
    expect(getImageModelById("nonexistent")).toBeUndefined();
  });

  it("getDefaultModel returns an enabled model", () => {
    const model = getDefaultImageModel();
    expect(model.enabled).toBe(true);
    expect(model.id).toBeTruthy();
  });

  it("getEnabledImageModels only returns enabled models", () => {
    const enabled = getEnabledImageModels();
    for (const m of enabled) {
      expect(m.enabled).toBe(true);
    }
  });

  it("getImageModelsByProvider groups correctly", () => {
    const grouped = getImageModelsByProvider();
    expect(Object.keys(grouped).length).toBeGreaterThanOrEqual(1);
    for (const [provider, models] of Object.entries(grouped)) {
      for (const m of models) {
        expect(m.provider).toBe(provider);
      }
    }
  });

  it("resolveImageProvider resolves OpenAI models", () => {
    expect(resolveImageProvider("dall-e-3")).toBe("openai");
    expect(resolveImageProvider("gpt-image-1")).toBe("openai");
  });

  it("resolveImageProvider resolves Replicate models", () => {
    expect(resolveImageProvider("flux-pro")).toBe("replicate");
    expect(resolveImageProvider("flux-schnell")).toBe("replicate");
    expect(resolveImageProvider("flux-dev")).toBe("replicate");
    expect(resolveImageProvider("realistic-vision-v6")).toBe("replicate");
    expect(resolveImageProvider("juggernaut-xl")).toBe("replicate");
  });

  it("resolveImageProvider resolves Stability models", () => {
    expect(resolveImageProvider("stable-diffusion-xl-1.0")).toBe("stability");
  });

  it("resolveImageProvider resolves Ideogram models", () => {
    expect(resolveImageProvider("ideogram-v3")).toBe("ideogram");
  });

  it("resolveImageProvider resolves Fal models", () => {
    expect(resolveImageProvider("fal-flux-pro")).toBe("fal");
  });

  it("resolveImageProvider resolves Google models", () => {
    expect(resolveImageProvider("gemini-image")).toBe("google-image");
  });

  it("resolveImageProvider throws for unknown model", () => {
    expect(() => resolveImageProvider("nonexistent")).toThrow("Unknown image model");
  });
});

describe("Image Types", () => {
  it("IMAGE_STYLE_PRESETS has 10 presets", () => {
    expect(IMAGE_STYLE_PRESETS.length).toBe(10);
  });

  it("each style preset has required fields", () => {
    for (const preset of IMAGE_STYLE_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(typeof preset.promptPrefix).toBe("string");
      expect(typeof preset.promptSuffix).toBe("string");
      expect(preset.icon).toBeTruthy();
    }
  });

  it("ASPECT_RATIO_SIZE_MAP covers all aspect ratios", () => {
    const ratios: AspectRatio[] = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"];
    for (const ratio of ratios) {
      expect(ASPECT_RATIO_SIZE_MAP[ratio]).toBeDefined();
      const size = ASPECT_RATIO_SIZE_MAP[ratio] as ImageSize;
      expect(size).toMatch(/^\d+x\d+$/);
    }
  });

  it("DEFAULT_IMAGE_SETTINGS has valid values", () => {
    expect(DEFAULT_IMAGE_SETTINGS.size).toMatch(/^\d+x\d+$/);
    expect(["standard", "hd"]).toContain(DEFAULT_IMAGE_SETTINGS.quality);
    expect(IMAGE_STYLE_PRESETS.map((s) => s.id)).toContain(DEFAULT_IMAGE_SETTINGS.style);
    expect(["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"]).toContain(DEFAULT_IMAGE_SETTINGS.aspectRatio);
    expect(DEFAULT_IMAGE_SETTINGS.numImages).toBeGreaterThanOrEqual(1);
  });
});
