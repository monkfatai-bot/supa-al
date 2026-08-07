/**
 * Supa AI — Image provider registry.
 *
 * Maps an image-provider id to a factory, lazy-instantiates the client on
 * first use, and caches the instance per process. `get()` throws
 * `ConfigurationError` when the provider's API key is unset so missing
 * config surfaces as an actionable error rather than a 502 from the
 * upstream SDK.
 *
 * Server-only.
 *
 * @module @/lib/ai/image-registry
 */
import "server-only";

import { ConfigurationError } from "@/lib/errors";

import type { ImageProviderId } from "./image-types";
import type { ImageProviderClient } from "./image-base";
import { FalImageProvider } from "./image-providers/fal";
import { GoogleImageProvider } from "./image-providers/google";
import { IdeogramImageProvider } from "./image-providers/ideogram";
import { OpenAIImageProvider } from "./image-providers/openai";
import { ReplicateImageProvider } from "./image-providers/replicate";
import { StabilityImageProvider } from "./image-providers/stability";

/** Factory + availability predicate for an image provider. */
interface ProviderRegistration {
  id: ImageProviderId;
  factory: () => ImageProviderClient;
  /** Returns true when the provider's API key is configured. */
  isConfigured: () => boolean;
  /** Env var name shown in the error message when missing. */
  envVar: string;
}

/**
 * Read an env var safely (process.env may be undefined in some edge
 * contexts). Returns an empty string when unset.
 */
function envVar(name: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  return process.env[name] ?? "";
}

const REGISTRY: Record<ImageProviderId, ProviderRegistration> = {
  openai: {
    id: "openai",
    factory: () => new OpenAIImageProvider(),
    isConfigured: () => !!envVar("OPENAI_API_KEY"),
    envVar: "OPENAI_API_KEY",
  },
  stability: {
    id: "stability",
    factory: () => new StabilityImageProvider(),
    isConfigured: () => !!envVar("STABILITY_API_KEY"),
    envVar: "STABILITY_API_KEY",
  },
  replicate: {
    id: "replicate",
    factory: () => new ReplicateImageProvider(),
    isConfigured: () => !!envVar("REPLICATE_API_TOKEN"),
    envVar: "REPLICATE_API_TOKEN",
  },
  fal: {
    id: "fal",
    factory: () => new FalImageProvider(),
    isConfigured: () => !!envVar("FAL_KEY"),
    envVar: "FAL_KEY",
  },
  ideogram: {
    id: "ideogram",
    factory: () => new IdeogramImageProvider(),
    isConfigured: () => !!envVar("IDEOGRAM_API_KEY"),
    envVar: "IDEOGRAM_API_KEY",
  },
  google: {
    id: "google",
    factory: () => new GoogleImageProvider(),
    isConfigured: () => !!envVar("GOOGLE_GENERATIVE_AI_API_KEY"),
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
  },
};

const VALID_PROVIDERS = Object.keys(REGISTRY) as ImageProviderId[];

function isProvider(id: string): id is ImageProviderId {
  return id in REGISTRY;
}

export class ImageProviderRegistry {
  private instances = new Map<ImageProviderId, ImageProviderClient>();

  /**
   * Get a provider client (lazy-init, cached). Throws `ConfigurationError`
   * when the provider's API key is unset.
   */
  get(providerId: string): ImageProviderClient {
    if (!isProvider(providerId)) {
      throw new ConfigurationError(
        `Unknown image provider: "${providerId}". Valid: ${VALID_PROVIDERS.join(", ")}.`,
      );
    }
    const reg = REGISTRY[providerId];
    if (!reg.isConfigured()) {
      throw new ConfigurationError(
        `Image provider "${providerId}" requires ${reg.envVar} to be set.`,
        { provider: providerId, envVar: reg.envVar },
      );
    }
    let instance = this.instances.get(providerId);
    if (!instance) {
      instance = reg.factory();
      this.instances.set(providerId, instance);
    }
    return instance;
  }

  /**
   * Get a provider client without throwing when the key is unset.
   * Returns `null` instead. Used by `listAvailable()` so a missing key
   * doesn't fail the catalog route.
   */
  tryGet(providerId: string): ImageProviderClient | null {
    if (!isProvider(providerId)) return null;
    const reg = REGISTRY[providerId];
    if (!reg.isConfigured()) return null;
    return this.get(providerId);
  }

  /** The configured default image provider id. */
  getDefaultId(): ImageProviderId {
    const def = envVar("IMAGE_DEFAULT_PROVIDER");
    return isProvider(def) ? def : "openai";
  }

  /** The configured default image model id. */
  getDefaultModel(): string {
    return envVar("IMAGE_DEFAULT_MODEL") || "dall-e-3";
  }

  /** Get the configured default provider. */
  getDefault(): ImageProviderClient {
    return this.get(this.getDefaultId());
  }

  /** Image providers with their API key configured. */
  listAvailable(): ImageProviderId[] {
    return VALID_PROVIDERS.filter((id) => REGISTRY[id].isConfigured());
  }

  /** All known image provider ids. */
  listAll(): ImageProviderId[] {
    return [...VALID_PROVIDERS];
  }
}

/** Shared singleton. */
export const imageRegistry = new ImageProviderRegistry();
