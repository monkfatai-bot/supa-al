/**
 * Supa AI — Remove background route.
 *
 * POST `/api/images/remove-bg`
 *
 * Removes the background of an existing image generation. Returns the
 * new `image_generations` row.
 *
 * @module @/app/api/images/remove-bg/route
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

    if (input.operation !== "remove-background") {
      return apiError(new Error("Invalid operation for /remove-bg route."));
    }

    const service = getImageService();
    const result = await service.removeBackground(user.id, input);

    return apiSuccess({ generation: result.generation });
  } catch (err) {
    return apiError(err);
  }
}
