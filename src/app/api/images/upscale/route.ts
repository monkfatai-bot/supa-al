/**
 * Supa AI — Upscale image route.
 *
 * POST `/api/images/upscale`
 *
 * Upscales an existing image generation to a larger size (1.5x by default).
 * Returns the new `image_generations` row.
 *
 * @module @/app/api/images/upscale/route
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

    if (input.operation !== "upscale") {
      return apiError(new Error("Invalid operation for /upscale route."));
    }

    const service = getImageService();
    const result = await service.upscale(user.id, input);

    return apiSuccess({ generation: result.generation });
  } catch (err) {
    return apiError(err);
  }
}
