/**
 * Supa AI — Phase 4 AI Images — client-safe barrel.
 *
 * Re-exports ONLY types and client-safe constants from the images
 * domain. **No `server-only` modules** live behind this barrel, so
 * Client Components can import from here without triggering the
 * `'server-only' cannot be imported from a Client Component` error.
 *
 * Client components MUST import from `@/lib/image/client`, NOT
 * `@/lib/image`. The full barrel (`@/lib/image`) pulls in
 * `image-service.ts` which imports `server-only`.
 *
 * @module @/lib/image/client
 */
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
