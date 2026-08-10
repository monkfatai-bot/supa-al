/**
 * Image service barrel export.
 * Only exports actions, types, and model info.
 * Provider adapters and registry are NOT re-exported
 * to keep the surface area small and prevent accidental client imports.
 */

export {
  generateImage,
  getImageHistory,
  getImageHistorySimple,
  getImageDetails,
  getSignedImageUrl,
  getSignedImageUrls,
  deleteImage,
  toggleFavoriteImage,
  regenerateImage,
  duplicateImage,
  savePrompt,
  getSavedPrompts,
  deletePrompt,
  uploadImageForEditing,
  enhancePrompt,
  editImage,
  getImageStats,
} from "./actions";

export type {
  ImageActionResponse,
  GenerateImageResponse,
  ImageHistoryItem,
  ImageHistoryParams,
  ImageHistoryResult,
} from "./actions";

export type {
  ImageSize,
  ImageQuality,
  ImageStylePreset,
  AspectRatio,
  ImageGenerationType,
  ImageEditOperation,
  ImageGenerationSettings,
  ImageGenerationInput,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageModelInfo,
  ImageStyleInfo,
  ImageAssetMetadata,
  ImageEditRequest,
  ImageEditResponse,
  PromptEnhancementResult,
} from "./types";

export {
  DEFAULT_IMAGE_SETTINGS,
  IMAGE_STYLE_PRESETS,
  ASPECT_RATIO_SIZE_MAP,
} from "./types";

export {
  AVAILABLE_IMAGE_MODELS,
  getImageModelById,
  getDefaultImageModel,
  getEnabledImageModels,
  getImageModelsByProvider,
  getImageProviders,
} from "./models";

// Re-export DB types for convenience
export type {
  AiImageGeneration,
  ImageAsset,
  ImagePrompt,
  ImageModel,
  ImageStyle,
  ImageUpload,
  ImageUsage,
} from "@/types/generated/database";
