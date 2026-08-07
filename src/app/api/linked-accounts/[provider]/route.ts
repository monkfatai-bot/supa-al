/**
 * Supa AI — Linked account unlink route.
 *
 * DELETE `/api/linked-accounts/:provider` — unlink a provider from the
 * caller's account. Requires a valid session. The `email` provider cannot
 * be unlinked (the data service throws `ValidationError`); that case is
 * surfaced as a 400 in the standard {@link ApiResponse} failure envelope.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { "unlinked": true } }
 * ```
 *
 * @module @/app/api/linked-accounts/[provider]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createLinkedAccountsService } from "@/lib/auth/linked-accounts";
import { NotFoundError, ValidationError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ provider: string }>;
}

const ALLOWED_PROVIDERS = new Set([
  "google",
  "github",
  "microsoft",
  "apple",
  "email",
]);

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { provider } = await ctx.params;

    if (!provider || !ALLOWED_PROVIDERS.has(provider)) {
      throw new NotFoundError("Linked account", provider);
    }

    if (provider === "email") {
      throw new ValidationError(
        "The primary email provider cannot be unlinked. Delete your account instead.",
        { provider },
      );
    }

    const service = await createLinkedAccountsService();
    await service.unlink(user.id, provider);

    return apiSuccess({ unlinked: true });
  } catch (err) {
    return apiError(err);
  }
}
