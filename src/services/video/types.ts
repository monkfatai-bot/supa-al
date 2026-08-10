/**
 * Video generation types — provider-agnostic.
 * All adapters must conform to these interfaces.
 */

// ─── Enums / Unions ───────────────────────────────────────

/** Supported video resolutions. */
export type VideoResolution =
  | "256x256"
  | "512x512"
  | "768x432"
  | "768x768"
  | "1024x576"
  | "1280x720"
  | "1920x1080"
  | "1080x1920";

/** Supported video aspect ratios. */
export type VideoAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

/** Camera movement options. */
export type CameraMovement =
  | "none"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "zoom-in"
  | "zoom-out"
  | "orbit-left"
  | "orbit-right"
  | "tilt-up"
  | "tilt-down";

/** Video generation type. */
export type VideoGenerationType =
  | "text-to-video"
  | "image-to-video"
  | "video-to-video"
  | "video-extension"
  | "style-transfer"
  | "video-enhancement"
  | "video-upscaling"
  | "frame-interpolation";

/** Video job status. */
export type VideoJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

// ─── Settings / Request ───────────────────────────────────

/** Settings passed to the video generation provider. */
export interface VideoGenerationSettings {
  resolution: VideoResolution;
  aspectRatio: VideoAspectRatio;
  durationSeconds: number;
  fps: number;
  seed?: number;
  negativePrompt?: string;
  motionStrength?: number;
  cameraMovement?: CameraMovement;
  stylePreset?: string;
  creativity?: number;
}

/** Full request sent from client to server action. */
export interface VideoGenerationInput {
  prompt: string;
  negativePrompt?: string;
  modelId: string;
  settings?: Partial<VideoGenerationSettings>;
  sourceImageStoragePath?: string;
  sourceVideoStoragePath?: string;
  generationType?: VideoGenerationType;
}

/** Request sent to a video provider adapter for async submission. */
export interface VideoGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  model: string;
  settings: VideoGenerationSettings;
  generationType: VideoGenerationType;
  sourceImageBase64?: string;
  sourceVideoBase64?: string;
}

// ─── Response / Error ──────────────────────────────────────

/** Response from a video provider after submitting a generation job. */
export interface VideoSubmitResponse {
  /** Provider-specific job ID for polling. */
  providerJobId: string;
  /** Estimated time in seconds (if available). */
  estimatedTimeSeconds?: number;
}

/** Response when polling a video job for completion. */
export interface VideoPollResponse {
  status: VideoJobStatus;
  progressPercent: number;
  /** URL of the completed video (when completed). */
  videoUrl?: string;
  /** Thumbnail URL (when completed). */
  thumbnailUrl?: string;
  /** Error message (when failed). */
  errorMessage?: string;
  /** Video metadata (when completed). */
  metadata?: VideoResultMetadata;
}

/** Metadata about a completed video result. */
export interface VideoResultMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  fileSizeBytes?: number;
}

/** Error returned when a video generation request fails. */
export interface VideoGenerationError {
  message: string;
  code: string;
  provider: string;
  statusCode?: number;
  retryable: boolean;
}

// ─── Metadata ──────────────────────────────────────────────

/** Rich metadata for a video model. */
export interface VideoModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  supportedResolutions: VideoResolution[];
  supportedAspectRatios: VideoAspectRatio[];
  supportedGenerationTypes: VideoGenerationType[];
  maxDurationSeconds: number;
  maxFps: number;
  creditCost: number;
  quality: "low" | "medium" | "high" | "ultra";
  speed: "slow" | "medium" | "fast";
  supportsNegativePrompt: boolean;
  supportsSeed: boolean;
  supportsMotionStrength: boolean;
  supportsCameraMovement: boolean;
  supportsStylePreset: boolean;
  supportsCreativity: boolean;
  supportsImageInput: boolean;
  supportsVideoInput: boolean;
  enabled: boolean;
}

// ─── Adapter Interface ─────────────────────────────────────

/** Interface every video provider adapter must implement. */
export interface VideoProviderAdapter {
  readonly providerId: string;
  readonly displayName: string;
  getAvailableModels(): VideoModelInfo[];
  /** Submit an async video generation job. Returns a provider job ID. */
  submitJob(request: VideoGenerationRequest): Promise<VideoSubmitResponse>;
  /** Poll the status of a previously submitted job. */
  pollJob(providerJobId: string, model: string): Promise<VideoPollResponse>;
  /** Cancel a running job. */
  cancelJob?(providerJobId: string, model: string): Promise<void>;
}

// ─── Credits ───────────────────────────────────────────────

/** Credit check result. */
export interface CreditCheckResult {
  sufficient: boolean;
  currentBalance: number;
  requiredCredits: number;
}

// ─── Defaults ──────────────────────────────────────────────

/** Default video generation settings. */
export const DEFAULT_VIDEO_SETTINGS: VideoGenerationSettings = {
  resolution: "1280x720",
  aspectRatio: "16:9",
  durationSeconds: 5,
  fps: 24,
};

/** Map aspect ratio to recommended resolution. */
export const ASPECT_RATIO_VIDEO_RESOLUTION_MAP: Record<VideoAspectRatio, VideoResolution> = {
  "1:1": "768x768",
  "16:9": "1280x720",
  "9:16": "1080x1920",
  "4:3": "1024x576",
  "3:4": "768x1024" as VideoResolution,
};
