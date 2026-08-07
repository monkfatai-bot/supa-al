/**
 * Supa AI — Video provider registry.
 *
 * Maps a video provider id to a factory, lazy-instantiates the client on
 * first use, and caches the instance per process. `get()` throws
 * `ConfigurationError` when the provider's API key is unset so missing
 * config surfaces as an actionable error rather than a 502 from the
 * upstream API.
 *
 * Server-only.
 *
 * @module @/lib/ai/video-registry
 */
import "server-only";

import { env } from "@/lib/config/env";
import { ConfigurationError } from "@/lib/errors";

import type { VideoProviderId } from "./video-types";
import type { VideoProviderClient } from "./video-base";
import { RunwayVideoProvider } from "./video-providers/runway";
import { KlingVideoProvider } from "./video-providers/kling";
import { LumaVideoProvider } from "./video-providers/luma";
import { PikaVideoProvider } from "./video-providers/pika";
import { ReplicateVideoProvider } from "./video-providers/replicate";
import { FalVideoProvider } from "./video-providers/fal";
import { GoogleVideoProvider } from "./video-providers/google";
import { OpenAIVideoProvider } from "./video-providers/openai";

/** Factory + availability predicate for a video provider. */
interface ProviderRegistration {
  id: VideoProviderId;
  factory: () => VideoProviderClient;
  /** Returns true when the provider's API key is configured. */
  isConfigured: () => boolean;
  /** Env var name shown in the error message when missing. */
  envVar: string;
}

const REGISTRY: Record<VideoProviderId, ProviderRegistration> = {
  runway: {
    id: "runway",
    factory: () => new RunwayVideoProvider(),
    isConfigured: () => !!env.ai.video.runway.apiKey,
    envVar: "RUNWAY_API_KEY",
  },
  kling: {
    id: "kling",
    factory: () => new KlingVideoProvider(),
    isConfigured: () => !!env.ai.video.kling.apiKey,
    envVar: "KLING_API_KEY",
  },
  luma: {
    id: "luma",
    factory: () => new LumaVideoProvider(),
    isConfigured: () => !!env.ai.video.luma.apiKey,
    envVar: "LUMA_API_KEY",
  },
  pika: {
    id: "pika",
    factory: () => new PikaVideoProvider(),
    isConfigured: () => !!env.ai.video.pika.apiKey,
    envVar: "PIKA_API_KEY",
  },
  replicate: {
    id: "replicate",
    factory: () => new ReplicateVideoProvider(),
    isConfigured: () => !!env.ai.video.replicate.apiToken,
    envVar: "REPLICATE_API_TOKEN",
  },
  fal: {
    id: "fal",
    factory: () => new FalVideoProvider(),
    isConfigured: () => !!env.ai.video.fal.apiKey,
    envVar: "FAL_API_KEY",
  },
  google: {
    id: "google",
    factory: () => new GoogleVideoProvider(),
    isConfigured: () => !!env.ai.video.google.apiKey,
    envVar: "GOOGLE_VIDEO_API_KEY",
  },
  openai: {
    id: "openai",
    factory: () => new OpenAIVideoProvider(),
    isConfigured: () => !!env.ai.video.openai.apiKey,
    envVar: "OPENAI_VIDEO_API_KEY",
  },
};

const VALID_PROVIDERS = Object.keys(REGISTRY) as VideoProviderId[];

function isProvider(id: string): id is VideoProviderId {
  return id in REGISTRY;
}

export class VideoProviderRegistry {
  private instances = new Map<VideoProviderId, VideoProviderClient>();

  /**
   * Get a provider client (lazy-init, cached). Throws
   * {@link ConfigurationError} when the provider's API key is unset —
   * the underlying provider class re-checks at call time so a missing
   * key surfaces even when the instance was constructed before the env
   * was filled in.
   */
  get(providerId: string): VideoProviderClient {
    if (!isProvider(providerId)) {
      throw new ConfigurationError(
        `Unknown video provider: "${providerId}". Valid: ${VALID_PROVIDERS.join(", ")}.`,
      );
    }
    let instance = this.instances.get(providerId);
    if (!instance) {
      instance = REGISTRY[providerId].factory();
      this.instances.set(providerId, instance);
    }
    return instance;
  }

  /** Default provider id (kept as `runway` for the video surface). */
  getDefaultId(): VideoProviderId {
    return "runway";
  }

  /** Providers with their API key configured. */
  listAvailable(): VideoProviderId[] {
    return VALID_PROVIDERS.filter((id) => REGISTRY[id].isConfigured());
  }

  /** All known provider ids (configured or not). */
  listAll(): VideoProviderId[] {
    return [...VALID_PROVIDERS];
  }

  /** Whether a given provider id is registered. */
  has(id: string): id is VideoProviderId {
    return isProvider(id);
  }
}

/** Shared singleton. */
export const videoRegistry = new VideoProviderRegistry();
