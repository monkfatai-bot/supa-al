/**
 * Supa AI — Verify-email route.
 *
 * POST `/api/auth/verify-email` — exchanges a token hash (from the email
 * verification link) for a verified email + (optionally) a session.
 *
 * Body: `{ tokenHash: string, type: 'signup' | 'email_change' | 'recovery' | 'invite' | 'magiclink' | 'email' }`
 *
 * The route does NOT require a session — the token hash IS the proof.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { "verified": true } }
 * ```
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { createAuthService } from "@/lib/auth/auth-service";
import { validateInput } from "@/lib/validation";

const verifyEmailSchema = z.object({
  tokenHash: z.string().min(1, "Token hash is required."),
  type: z.enum(["signup", "email_change", "recovery", "invite", "magiclink", "email"]),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const input = validateInput(verifyEmailSchema, await req.json());
    const authService = await createAuthService();
    await authService.verifyEmail(input.tokenHash, input.type);
    return apiSuccess({ verified: true });
  } catch (err) {
    return apiError(err);
  }
}
