/**
 * Supa AI — AI image facade.
 *
 * Single entry point for application code that needs image generation.
 * Picks the default provider (or one explicitly requested), lists models,
 * and exposes the `generate` + `listModels` + `listAvailable` methods.
 *
 * Server-only.
 *
 * @module @/lib/ai/image-manager
 */
import "server-only";

import {
  ImageProviderRegistry,
  imageRegistry,
} from "./image-registry";
import type { ImageProviderClient } from "./image-base";
import type {
  ImageGenRequest,
  ImageGenResult,
  ImageModel,
  ImageProviderId,
} from "./image-types";

export type {
  ImageEditOperation,
  ImageEditResult,
  ImageGenRequest,
  ImageGenResult,
  ImageModel,
  ImageProviderId,
  ImageQuality,
} from "./image-types";
export {
  BaseImageProvider,
  type ImageProviderClient,
} from "./image-base";
export { ImageProviderRegistry, imageRegistry } from "./image-registry";

/** Optional metadata passed alongside an image generation request. */
export interface ImageOptions {
  /** Override the default provider. */
  provider?: ImageProviderId;
  /** Org to attribute usage to. */
  orgId?: string;
  /** User to attribute usage to. */
  userId?: string;
  /** Feature tag for usage analytics (defaults to `image-gen`). */
  feature?: string;
}

interface ImageFacade {
  /** Generate an image (or apply an edit when `sourceImageUrl` is set). */
  generate(req: ImageGenRequest, opts?: ImageOptions): Promise<ImageGenResult>;
  /** Resolve a provider client by id (default if omitted). */
  getProvider(id?: ImageProviderId): ImageProviderClient;
  /** List providers that have an API key configured. */
  listAvailable(): ImageProviderId[];
  /** List models for a specific provider (default if omitted). */
  listModels(providerId?: ImageProviderId): Promise<ImageModel[]>;
}

class ImageFacadeImpl implements ImageFacade {
  getProvider(id?: ImageProviderId): ImageProviderClient {
    return id ? imageRegistry.get(id) : imageRegistry.getDefault();
  }

  listAvailable(): ImageProviderId[] {
    return imageRegistry.listAvailable();
  }

  async listModels(providerId?: ImageProviderId): Promise<ImageModel[]> {
    const client = providerId
      ? imageRegistry.get(providerId)
      : imageRegistry.getDefault();
    return client.listModels();
  }

  async generate(
    req: ImageGenRequest,
    _opts: ImageOptions = {},
  ): Promise<ImageGenResult> {
    const providerId = (req as ImageGenRequest & { provider?: ImageProviderId }).provider;
    const client = providerId
      ? imageRegistry.get(providerId)
      : imageRegistry.getDefault();
    const res = await client.generate(req);
    return res;
  }
}

/** Top-level image facade used across the app. */
export const image: ImageFacade = new ImageFacadeImpl();
