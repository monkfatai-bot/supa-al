/**
 * Supa AI — Phase 10 Integration Hub — credentials rotate.
 *
 * POST `/api/v1/integrations/credentials/rotate` — re-encrypt every
 * credential with the current key. Admin-only.
 *
 * @module @/app/api/v1/integrations/credentials/rotate/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getCredentialVault } from "@/lib/integrations";

export async function POST(_req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const vault = getCredentialVault();
    const rotated = await vault.rotateAllKeys();
    return apiSuccess({ rotated });
  } catch (err) {
    return apiError(err);
  }
}
