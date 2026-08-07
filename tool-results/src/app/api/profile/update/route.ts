/**
 * Supa AI — Profile update route.
 *
 * POST `/api/profile/update` — partial-update the caller's profile. Body
 * is validated against `updateProfileSchema` (re-extended locally to
 * accept `avatar_url`, since avatar uploads land here too). Only the
 * fields the caller provides are mutated; absent fields are untouched.
 *
 * Requires a valid session. Returns the updated `Profile` row in the
 * standard {@link ApiResponse} success envelope.
 *
 * Special handling:
 *   - `avatar_url: string`  — delegated to `ProfileService.updateAvatar`.
 *   - `avatar_url: null`    — clears the avatar column via a direct
 *                             server-client update (RLS allows the owner
 *                             to null their own `avatar_url`). The data
 *                             service does not expose a "clearAvatar"
 *                             method, so we do it inline.
 *   - All other fields      — delegated to `ProfileService.updateProfile`.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { ...profileRow } }
 * ```
 *
 * @module @/app/api/profile/update/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createProfileService } from "@/lib/auth/profile";
import { DatabaseError, NotFoundError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/types";
import { validateInput } from "@/lib/validation";
import { updateProfileSchema } from "@/lib/validation/auth";

/**
 * Local extension of {@link updateProfileSchema} that also accepts the
 * `avatar_url` field. We don't extend the canonical schema in
 * `validation/auth.ts` because the data service's `updateProfile` method
 * deliberately omits `avatar_url` from its `UpdateProfileInput` (avatar
 * writes flow through `updateAvatar`). Allowing it here lets the avatar
 * upload component reuse the same endpoint.
 */
const profileUpdateRouteSchema = updateProfileSchema.extend({
  avatar_url: z
    .string()
    .url("Avatar URL must be a valid URL.")
    .nullable()
    .optional(),
});

type ProfileUpdateRouteInput = z.infer<typeof profileUpdateRouteSchema>;

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(profileUpdateRouteSchema, await req.json());

    const profileService = await createProfileService();

    // Separate avatar handling from the regular profile fields.
    const { avatar_url: avatarUrl, ...rest } = input;

    let profile = await profileService.getProfile(user.id);

    if (Object.keys(rest).length > 0) {
      profile = await profileService.updateProfile(user.id, rest);
    }

    if (avatarUrl !== undefined) {
      if (avatarUrl === null) {
        profile = await clearAvatarUrl(user.id);
      } else {
        profile = await profileService.updateAvatar(user.id, avatarUrl);
      }
    }

    if (!profile) {
      throw new NotFoundError("Profile", user.id);
    }

    return apiSuccess(profile);
  } catch (err) {
    return apiError(err);
  }
}

/**
 * Null-out the caller's `avatar_url` via the RLS-enforced server client.
 * The data service doesn't expose a "clearAvatar" method, so we do it
 * inline. RLS allows the owner to update their own row.
 */
async function clearAvatarUrl(userId: string) {
  // Cast to the structural `AnySupabaseClient` type so the `.update()` call
  // resolves correctly. `@supabase/ssr`'s `createServerClient` generic
  // defaults diverge slightly from `@supabase/supabase-js`'s on `.update()`
  // (a known signature mismatch — same root cause as `AnySupabaseClient` in
  // `src/lib/auth/helpers.ts`). The runtime behavior is identical.
  const supabase = (await createSupabaseServerClient()) as unknown as AnySupabaseClient;
  const updates: TablesUpdate<"profiles"> = { avatar_url: null };
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .maybeSingle();

  if (error) {
    throw new DatabaseError("Failed to clear avatar_url.", {
      userId,
      cause: error.message,
    });
  }
  if (!data) {
    throw new NotFoundError("Profile", userId);
  }
  return data;
}

// Keep the type referenced for downstream tooling.
export type { ProfileUpdateRouteInput };
