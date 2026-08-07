/**
 * Supa AI — Generate image route.
 *
 * POST `/api/images/generate`
 *
 * Validates the input, requires authentication, calls
 * `ImageService.generate`, and returns the resulting
 * `image_generations` row.
 *
 * @module @/app/api/images/generate/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getImageService } from "@/lib/image";
import { validateInput } from "@/lib/validation";
import { generateImageSchema } from "@/lib/validation/image";

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(generateImageSchema, await req.json());

    const service = getImageService();
    const generation = await service.generate(user.id, input);

    return apiSuccess({ generation });
  } catch (err) {
    return apiError(err);
  }
}
