/**
 * Image generation types — provider-agnostic.
 * All adapters must conform to these interfaces.
 */

// ─── Enums / Unions ───────────────────────────────────────

/** Supported image sizes for generation. */
export type ImageSize =
  | "512x512"
  | "768x768"
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "1792x1024"
  | "1024x1792"
  | "2048x2048";

/** Aspect ratio presets for generation. */
export type AspectRatio =
  | "1:1"
  | "4:3"
  | "3:4"
  | "16:9"
  | "9:16"
  | "3:2"
  | "2:3";

/** Image quality options. */
export type ImageQuality = "standard" | "hd";

/** Image style presets. */
export type ImageStylePreset =
  | "vivid"
  | "natural"
  | "anime"
  | "photographic"
  | "digital-art"
  | "fantasy-art"
  | "cinematic"
  | "3d-model"
  | "neon-punk"
  | "enhance";

/** Generation type. */
export type ImageGenerationType =
  | "text-to-image"
  | "image-to-image"
  | "image-variations"
  | "image-editing"
  | "inpainting"
  | "outpainting";

/** Editing operation type. */
export type ImageEditOperation =
  | "background-removal"
  | "background-replace"
  | "object-removal"
  | "object-replacement"
  | "face-enhancement"
  | "color-correction"
  | "upscaling"
  | "sharpening"
  | "denoising"
  | "image-restoration";

/** Image upload status. */
export type ImageUploadStatus = "pending" | "processed" | "failed";

// ─── Settings / Request ───────────────────────────────────

/** Settings passed to the image generation provider. */
export interface ImageGenerationSettings {
  size: ImageSize;
  quality: ImageQuality;
  style: ImageStylePreset;
  aspectRatio: AspectRatio;
  numImages: number;
  seed?: number;
  guidanceScale?: number;
  steps?: number;
  strength?: number;
}

/** Full request sent from client to server action. */
export interface ImageGenerationInput {
  prompt: string;
  negativePrompt?: string;
  modelId: string;
  settings?: Partial<ImageGenerationSettings>;
  sourceImageStoragePath?: string;
  editOperation?: ImageEditOperation;
  editMaskStoragePath?: string;
}

/** Request sent to an image provider adapter. */
export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  model: string;
  settings: ImageGenerationSettings;
  generationType: ImageGenerationType;
  sourceImageBase64?: string;
  editMaskBase64?: string;
}

// ─── Response / Error ──────────────────────────────────────

/** A single image result from the provider. */
export interface ImageResult {
  /** Base64-encoded image data. */
  imageData: string;
  /** The revised prompt used by the provider. */
  revisedPrompt?: string;
  /** Seed used for this specific result. */
  seed?: number;
}

/** Response from a successful image generation. */
export interface ImageGenerationResponse {
  results: ImageResult[];
  model: string;
  provider: string;
}

/** Error returned when an image generation request fails. */
export interface ImageGenerationError {
  message: string;
  code: string;
  provider: string;
  statusCode?: number;
  retryable: boolean;
}

// ─── Metadata ──────────────────────────────────────────────

/** Metadata stored with an image asset. */
export interface ImageAssetMetadata {
  width: number;
  height: number;
  format: string;
  revisedPrompt?: string;
  sizeBytes: number;
  generationTimeMs?: number;
}

/** Rich metadata for an image model. */
export interface ImageModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  supportedSizes: ImageSize[];
  supportedAspectRatios: AspectRatio[];
  supportedGenerationTypes: ImageGenerationType[];
  creditCost: number;
  maxResolution: string;
  quality: "low" | "medium" | "high" | "ultra";
  speed: "slow" | "medium" | "fast";
  supportsNegativePrompt: boolean;
  supportsSeed: boolean;
  supportsGuidanceScale: boolean;
  supportsSteps: boolean;
  supportsStrength: boolean;
  maxNumImages: number;
  enabled: boolean;
}

/** Style preset definition. */
export interface ImageStyleInfo {
  id: string;
  name: string;
  description: string;
  promptPrefix: string;
  promptSuffix: string;
  icon: string;
}

// ─── Adapter Interface ─────────────────────────────────────

/** Interface every image provider adapter must implement. */
export interface ImageProviderAdapter {
  readonly providerId: string;
  readonly displayName: string;
  getAvailableModels(): ImageModelInfo[];
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;
  /** Optional: edit operations like background removal, upscaling. */
  editImage?(request: ImageEditRequest): Promise<ImageEditResponse>;
}

/** Request for image editing operations. */
export interface ImageEditRequest {
  operation: ImageEditOperation;
  imageBase64: string;
  prompt?: string;
  settings?: Record<string, unknown>;
}

/** Response from image editing operations. */
export interface ImageEditResponse {
  imageData: string;
  operation: ImageEditOperation;
  provider: string;
}

// ─── Upload ────────────────────────────────────────────────

/** Validated image upload. */
export interface ValidatedImageUpload {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  base64: string;
}

/** Upload validation result. */
export interface UploadValidationResult {
  valid: boolean;
  error?: string;
}

// ─── Prompt Enhancement ────────────────────────────────────

/** Prompt enhancement result. */
export interface PromptEnhancementResult {
  enhancedPrompt: string;
  suggestions: string[];
}

// ─── Credits ───────────────────────────────────────────────

/** Credit check result. */
export interface CreditCheckResult {
  sufficient: boolean;
  currentBalance: number;
  requiredCredits: number;
}

// ─── Defaults ──────────────────────────────────────────────

/** Default generation settings. */
export const DEFAULT_IMAGE_SETTINGS: ImageGenerationSettings = {
  size: "1024x1024",
  quality: "standard",
  style: "vivid",
  aspectRatio: "1:1",
  numImages: 1,
};

/** Map aspect ratio to recommended size. */
export const ASPECT_RATIO_SIZE_MAP: Record<AspectRatio, ImageSize> = {
  "1:1": "1024x1024",
  "4:3": "1536x1024",
  "3:4": "1024x1536",
  "16:9": "1792x1024",
  "9:16": "1024x1792",
  "3:2": "1536x1024",
  "2:3": "1024x1536",
};

/** Built-in style presets. */
export const IMAGE_STYLE_PRESETS: ImageStyleInfo[] = [
  {
    id: "vivid",
    name: "Vivid",
    description: "Bold, vibrant, highly detailed images",
    promptPrefix: "",
    promptSuffix: ", vibrant colors, highly detailed, sharp focus",
    icon: "Palette",
  },
  {
    id: "natural",
    name: "Natural",
    description: "Realistic, natural-looking images",
    promptPrefix: "",
    promptSuffix: ", photorealistic, natural lighting, 8k uhd",
    icon: "Leaf",
  },
  {
    id: "anime",
    name: "Anime",
    description: "Japanese animation style",
    promptPrefix: "anime style, ",
    promptSuffix: ", anime art, detailed anime illustration",
    icon: "Sparkles",
  },
  {
    id: "photographic",
    name: "Photographic",
    description: "Professional photography look",
    promptPrefix: "professional photography, ",
    promptSuffix: ", shot on DSLR, bokeh, professional color grading",
    icon: "Camera",
  },
  {
    id: "digital-art",
    name: "Digital Art",
    description: "Modern digital art style",
    promptPrefix: "digital art, ",
    promptSuffix: ", digital painting, artstation, trending on artstation",
    icon: "PenTool",
  },
  {
    id: "fantasy-art",
    name: "Fantasy Art",
    description: "Epic fantasy illustration style",
    promptPrefix: "fantasy art, ",
    promptSuffix: ", epic fantasy, detailed illustration, concept art",
    icon: "Wand2",
  },
  {
    id: "cinematic",
    name: "Cinematic",
    description: "Cinematic movie scene look",
    promptPrefix: "cinematic shot, ",
    promptSuffix: ", cinematic lighting, dramatic, film grain, movie still",
    icon: "Film",
  },
  {
    id: "3d-model",
    name: "3D Render",
    description: "3D rendered look",
    promptPrefix: "3d render, ",
    promptSuffix: ", 3d model, octane render, unreal engine, ray tracing",
    icon: "Box",
  },
  {
    id: "neon-punk",
    name: "Neon Punk",
    description: "Cyberpunk neon aesthetic",
    promptPrefix: "neon punk style, ",
    promptSuffix: ", cyberpunk, neon lights, dark background, vibrant neon colors",
    icon: "Zap",
  },
  {
    id: "enhance",
    name: "Enhance",
    description: "Enhanced detail and quality",
    promptPrefix: "",
    promptSuffix: ", masterpiece, best quality, ultra-detailed, 4k",
    icon: "Sparkle",
  },
];
