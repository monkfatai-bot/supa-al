/**
 * Supa AI — Image models catalog route.
 *
 * GET `/api/images/models`
 *
 * Returns the active image models filtered to providers with an API key
 * configured. The picker uses this to render the model dropdown.
 *
 * @module @/app/api/images/models/route
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { listImageModels, requireImageProviderConfigured } from "@/lib/image";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAuth();
    requireImageProviderConfigured();

    const models = await listImageModels(true);

    return apiSuccess({ models });
  } catch (err) {
    return apiError(err);
  }
}
