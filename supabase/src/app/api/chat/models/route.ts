/**
 * Supa AI — Model catalog route.
 *
 * GET `/api/chat/models`
 *
 * Returns the model catalog from `modelManager.listByProvider()` + which
 * providers are configured (`ai.listAvailable()`). The UI uses this to
 * render the model picker: only providers with an API key configured are
 * shown, and within each provider, only enabled models.
 *
 * Requires a valid session.
 *
 * Response envelope (success):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "groups": [{ "provider": "openai", "label": "OpenAI", "models": [...] }],
 *     "availableProviders": ["openai", "anthropic"],
 *     "defaultProvider": "openai",
 *     "defaultModel": "gpt-4o-mini"
 *   }
 * }
 * ```
 *
 * @module @/app/api/chat/models/route
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { ai } from "@/lib/ai";
import { modelManager } from "@/lib/ai/model-manager";
import { env } from "@/lib/config/env";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAuth();

    const groups = modelManager.listByProvider();
    const availableProviders = ai.listAvailable();

    // Filter the groups to only providers that have an API key configured.
    // The catalog may include models whose provider isn't wired up —
    // hiding them keeps the picker honest.
    const visibleGroups = groups
      .filter((g) => availableProviders.includes(g.provider))
      .map((g) => ({
        provider: g.provider,
        label: g.label,
        models: g.models.map((m) => ({
          id: m.id,
          label: m.label,
          contextWindow: m.contextWindow,
          maxOutputTokens: m.maxOutputTokens,
          inputCostCentsPer1K: m.inputCostCentsPer1K,
          outputCostCentsPer1K: m.outputCostCentsPer1K,
          capabilities: m.capabilities,
          tier: m.tier,
          description: m.description,
        })),
      }));

    return apiSuccess({
      groups: visibleGroups,
      availableProviders,
      defaultProvider: env.ai.defaultProvider,
      defaultModel: env.ai.defaultModel,
    });
  } catch (err) {
    return apiError(err);
  }
}
