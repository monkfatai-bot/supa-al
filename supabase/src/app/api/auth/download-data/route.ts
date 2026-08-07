/**
 * Supa AI — Download-my-data route (GDPR data export).
 *
 * POST `/api/auth/download-data` — requests a signed-URL data export for the
 * currently-authenticated user. Delegates to `accountService.requestDataExport`
 * which writes an `account_deletion_requests` row (request_type='data_export')
 * and returns a time-limited signed URL pointing at the export archive.
 *
 * Requires a valid session.
 *
 * Response envelope (success):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "downloadUrl": "https://...",
 *     "expiresAt": "2024-01-15T12:34:56.000Z"
 *   }
 * }
 * ```
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAuthService } from "@/lib/auth/auth-service";

export async function POST(): Promise<NextResponse> {
  try {
    await requireAuth();
    const authService = await createAuthService();
    const result = await authService.downloadMyData();
    return apiSuccess(result);
  } catch (err) {
    return apiError(err);
  }
}
