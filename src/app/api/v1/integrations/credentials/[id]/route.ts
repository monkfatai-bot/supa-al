/**
 * Supa AI — Phase 10 Integration Hub — credentials management.
 *
 * GET    `/api/v1/integrations/credentials/[id]` — list credentials for an integration.
 * DELETE `/api/v1/integrations/credentials/[id]` — delete a specific credential.
 *
 * Note: the `[id]` parameter is the integration id (not the credential id)
 * for the GET; for DELETE it is the credential id.
 *
 * @module @/app/api/v1/integrations/credentials/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getCredentialVault } from "@/lib/integrations";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const vault = getCredentialVault();
    // Return a metadata-only list — never the plaintext values.
    const creds = await vault.getDecryptedCredentials(id);
    const meta = Object.entries(creds).map(([type, c]) => ({
      id: c.id,
      type,
      expiresAt: c.expiresAt,
      scopes: c.scopes,
      keyVersion: c.keyVersion,
      lastRotatedAt: c.lastRotatedAt,
    }));
    return apiSuccess({ credentials: meta });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const vault = getCredentialVault();
    await vault.delete(id);
    return apiSuccess({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
