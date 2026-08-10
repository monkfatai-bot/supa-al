/**
 * Adapter Barrel Export
 *
 * Registers ALL provider adapters with the ProviderRegistry singleton.
 * This module is imported as a side-effect from the provider-framework index.
 * Adapters are only instantiated — no API calls are made here.
 */

import { getInstance } from "../registry";

// AI providers
import { openAiProviderAdapter, anthropicProviderAdapter, googleGeminiProviderAdapter } from "./ai-providers";

// Communication providers
import {
  gmailProviderAdapter,
  slackProviderAdapter,
  discordProviderAdapter,
  telegramProviderAdapter,
  whatsappProviderAdapter,
  teamsProviderAdapter,
  outlookProviderAdapter,
} from "./communication-providers";

// Storage providers
import {
  googleDriveProviderAdapter,
  dropboxProviderAdapter,
  oneDriveProviderAdapter,
  boxProviderAdapter,
} from "./storage-providers";

// Payment providers
import {
  stripeProviderAdapter,
  paystackProviderAdapter,
  flutterwaveProviderAdapter,
} from "./payment-providers";

// Development providers
import {
  githubProviderAdapter,
  gitlabProviderAdapter,
  bitbucketProviderAdapter,
} from "./dev-providers";

// Commerce providers
import { shopifyProviderAdapter, woocommerceProviderAdapter } from "./commerce-providers";

// Automation providers
import { zapierProviderAdapter, makeProviderAdapter } from "./automation-providers";

// Register all adapters
const registry = getInstance();

// AI (7 adapters registered via AI service — these 3 are for provider framework)
registry.register(openAiProviderAdapter);
registry.register(anthropicProviderAdapter);
registry.register(googleGeminiProviderAdapter);

// Communication (7)
registry.register(gmailProviderAdapter);
registry.register(slackProviderAdapter);
registry.register(discordProviderAdapter);
registry.register(telegramProviderAdapter);
registry.register(whatsappProviderAdapter);
registry.register(teamsProviderAdapter);
registry.register(outlookProviderAdapter);

// Storage (4)
registry.register(googleDriveProviderAdapter);
registry.register(dropboxProviderAdapter);
registry.register(oneDriveProviderAdapter);
registry.register(boxProviderAdapter);

// Payment (3)
registry.register(stripeProviderAdapter);
registry.register(paystackProviderAdapter);
registry.register(flutterwaveProviderAdapter);

// Development (3)
registry.register(githubProviderAdapter);
registry.register(gitlabProviderAdapter);
registry.register(bitbucketProviderAdapter);

// Commerce (2)
registry.register(shopifyProviderAdapter);
registry.register(woocommerceProviderAdapter);

// Automation (2)
registry.register(zapierProviderAdapter);
registry.register(makeProviderAdapter);
