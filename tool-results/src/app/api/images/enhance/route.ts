/**
 * Supa AI — Enhance image route.
 *
 * POST `/api/images/enhance`
 *
 * Re-runs an existing image generation with a (possibly) revised prompt.
 * Returns the new `image_generations` row.
 *
 * @module @/app/api/images/enhance/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getImageService } from "@/lib/image";
import { validateInput } from "@/lib/validation";
import { editImageSchema } from "@/lib/validation/image";

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(editImageSchema, await req.json());

    if (input.operation !== "enhance") {
      // Defensive: schema already enforces this, but we double-check.
      return apiError(new Error("Invalid operation for /enhance route."));
    }

    const service = getImageService();
    const result = await service.enhance(user.id, input);

    return apiSuccess({ generation: result.generation });
  } catch (err) {
    return apiError(err);
  }
}
