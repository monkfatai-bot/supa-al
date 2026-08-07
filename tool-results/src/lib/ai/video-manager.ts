/**
 * Supa AI — Video provider manager.
 *
 * Convenience facade over the {@link videoRegistry} for the high-level
 * video service. Resolves a provider, dispatches `generate` /
 * `getJobStatus`, and merges per-provider static catalogs with the
 * persisted `video_models` rows (so the UI can show provider-driven
 * defaults alongside admin-configured overrides).
 *
 * Server-only.
 *
 * @module @/lib/ai/video-manager
 */
import "server-only";

import { videoRegistry } from "./video-registry";
import type { VideoProviderClient } from "./video-base";
import type {
  VideoGenerateRequest,
  VideoGenerationResult,
  VideoJobPollResult,
  VideoModel,
  VideoProviderId,
} from "./video-types";

export class VideoManager {
  /** Resolve a provider client by id. */
  getProvider(id: VideoProviderId): VideoProviderClient {
    return videoRegistry.get(id);
  }

  /** Submit a generation request to the named provider. */
  async generate(
    providerId: VideoProviderId,
    req: VideoGenerateRequest,
  ): Promise<VideoGenerationResult> {
    return this.getProvider(providerId).generate(req);
  }

  /** Poll a previously-submitted job. */
  async getJobStatus(
    providerId: VideoProviderId,
    externalJobId: string,
  ): Promise<VideoJobPollResult> {
    return this.getProvider(providerId).getJobStatus(externalJobId);
  }

  /** Return the static catalog for a provider (no admin overrides merged). */
  async listModels(providerId: VideoProviderId): Promise<VideoModel[]> {
    return this.getProvider(providerId).listModels();
  }

  /** Return every provider's static catalog as a flat array. */
  async listAllModels(): Promise<VideoModel[]> {
    const providers = videoRegistry.listAll();
    const results = await Promise.all(
      providers.map((p) => this.listModels(p).catch(() => [])),
    );
    return results.flat();
  }

  /** Provider ids that have an API key configured. */
  listAvailable(): VideoProviderId[] {
    return videoRegistry.listAvailable();
  }

  /** All known provider ids (configured or not). */
  listAll(): VideoProviderId[] {
    return videoRegistry.listAll();
  }
}

/** Shared singleton. */
export const videoManager = new VideoManager();
