/**
 * Supa AI — Video jobs list route.
 *
 * GET `/api/video/jobs?status=&limit=&offset=`
 *
 * Paginated list of the caller's video jobs (newest first). Optional
 * `status` filter restricts to a single lifecycle state.
 *
 * @module @/app/api/video/jobs/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateInput } from "@/lib/validation";
import type { VideoJob } from "@/lib/video/client";

const listJobsQuerySchema = z.object({
  status: z
    .enum(["pending", "processing", "completed", "failed", "cancelled"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listJobsQuerySchema, {
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const limit = query.limit ?? 30;
    const offset = query.offset ?? 0;
    const supabase = await createSupabaseServerClient();

    // Join through `video_generations` so ownership is enforced via the
    // RLS policy on that table (the `video_jobs` RLS policy also checks
    // `video_generations.user_id = auth.uid()`, but the join keeps the
    // query plan simple).
    let q = supabase
      .from("video_jobs")
      .select(
        "*, generation:video_generations(*)",
      )
      .eq("generation.user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (query.status) q = q.eq("status", query.status);

    const { data, error } = await q;
    if (error) {
      throw new Error(`video_jobs.list failed: ${error.message}`);
    }
    return apiSuccess({ jobs: (data ?? []) as unknown as VideoJob[] });
  } catch (err) {
    return apiError(err);
  }
}
