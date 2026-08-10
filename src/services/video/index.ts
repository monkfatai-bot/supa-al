/**
 * Video service barrel export.
 * Only exports actions, types, and model info.
 * Provider adapters and registry are NOT re-exported.
 */

export {
  generateVideo,
  uploadSourceFile,
  getVideoHistory,
  getVideoHistorySimple,
  getVideoDetails,
  getJobStatus,
  cancelJob,
  deleteVideo,
  toggleFavoriteVideo,
  duplicateVideo,
  getSignedVideoUrl,
  getSignedVideoUrlsForPaths,
  getVideoStats,
  getActiveJobs,
} from "./actions";

export type {
  VideoActionResponse,
  GenerateVideoResponse,
  VideoHistoryItem,
  VideoHistoryParams,
  VideoHistoryResult,
} from "./actions";

export type {
  VideoResolution,
  VideoAspectRatio,
  CameraMovement,
  VideoGenerationType,
  VideoJobStatus,
  VideoGenerationSettings,
  VideoGenerationInput,
  VideoGenerationRequest,
  VideoSubmitResponse,
  VideoPollResponse,
  VideoResultMetadata,
  VideoGenerationError,
  VideoModelInfo,
  VideoProviderAdapter,
} from "./types";

export {
  DEFAULT_VIDEO_SETTINGS,
  ASPECT_RATIO_VIDEO_RESOLUTION_MAP,
} from "./types";

export {
  AVAILABLE_VIDEO_MODELS,
  getVideoModelById,
  getDefaultVideoModel,
  getEnabledVideoModels,
  getVideoModelsByProvider,
  getVideoProviders,
} from "./models";

// Re-export DB types for convenience
export type {
  VideoGeneration,
  VideoJob,
  VideoModel,
  VideoUpload,
  VideoUsage,
} from "@/types/generated/database";
