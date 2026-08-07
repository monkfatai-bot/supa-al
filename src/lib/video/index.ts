/**
 * Supa AI — Phase 5 AI Video — full barrel (server-only).
 *
 * Re-exports the client-safe types *plus* the server-only
 * {@link VideoService}, catalog, history, job queue, storage, upload,
 * and usage services. Importing this barrel from a Client Component
 * will throw at build time — client code MUST import from
 * `@/lib/video/client` instead.
 *
 * @module @/lib/video
 */
import "server-only";

export * from "./client";
export {
  VideoService,
  createVideoService,
  createVideoServiceAdmin,
} from "./video-service";
export {
  VideoCatalogService,
  createVideoCatalogService,
  type VideoCatalogGroup,
  type VideoCatalogModel,
} from "./catalog";
export {
  VideoHistoryService,
  createVideoHistoryService,
} from "./history";
export {
  VideoJobQueue,
  createVideoJobQueue,
  type RunJobInput,
} from "./job-queue";
export {
  VideoStorageService,
  createVideoStorageService,
} from "./storage";
export {
  VideoUploadService,
  createVideoUploadService,
} from "./upload";
export {
  VideoUsageService,
  createVideoUsageService,
  BY_PROVIDER_COLUMN,
} from "./usage";
