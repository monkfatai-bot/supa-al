/**
 * Supa AI — User-settings update route.
 *
 * PATCH `/api/settings/update` — partial-update the caller's `user_settings`
 * row. Body is validated with `updateSettingsSchema` (which is `.strict()`
 * so unknown keys are rejected). Only the fields the caller provides are
 * mutated.
 *
 * Requires a valid session. Returns the updated `UserSettings` row in the
 * standard {@link ApiResponse} success envelope.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { ...settingsRow } }
 * ```
 *
 * @module @/app/api/settings/update/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createSettingsService } from "@/lib/auth/settings";
import { validateInput } from "@/lib/validation";
import { updateSettingsSchema } from "@/lib/validation/auth";

export async function PATCH(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(updateSettingsSchema, await req.json());

    const settingsService = await createSettingsService();
    const settings = await settingsService.updateSettings(user.id, input);

    return apiSuccess(settings);
  } catch (err) {
    return apiError(err);
  }
}
