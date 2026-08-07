/**
 * Supa AI — Phase 4 Image service barrel (server-only).
 *
 * Re-exports every Phase 4 image service + type so callers can
 * `import { getImageService, listImageModels, ... } from "@/lib/image"`.
 *
 * @module @/lib/image
 */
import "server-only";

export {
  getImageService,
  getImageServiceWith,
  isImageGenerationEnabled,
  ImageService,
  ConfigurationError,
  PaymentError,
} from "./image-service";

export {
  listImageModels,
  listImageStyles,
  requireImageProviderConfigured,
} from "./catalog";

export {
  listImageHistory,
  type ImageHistoryResult,
} from "./history";

export {
  getImageUsage,
  recordImageUsage,
} from "./usage";

export { uploadImage } from "./upload";

export type {
  EditImageInput,
  EditImageResult,
  GenerateImageInput,
  ImageGeneration,
  ImageGenerationInsert,
  ImageGenerationStatus,
  ImageGenerationUpdate,
  ImageModelRow,
  ImageStyle,
  ImageUpload,
  ImageUploadInsert,
  ImageUsage,
  ImageUsageInsert,
  ImageUsageQuery,
  ImageUsageStats,
  ListImagesQuery,
  UploadImageInput,
  UploadImageResult,
} from "./types";
