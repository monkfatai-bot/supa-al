/**
 * Supa AI — Phase 9 comments list + create route.
 *
 * GET  `/api/workspace/comments?workspaceId=...` — list comments.
 * POST `/api/workspace/comments`                 — create a comment.
 *
 * @module @/app/api/workspace/comments/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createCommentService } from "@/lib/workspace";
import { validateInput } from "@/lib/validation";
import {
  createCommentSchema,
  listCommentsQuerySchema,
} from "@/lib/validation/workspace";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listCommentsQuerySchema, {
      workspaceId: url.searchParams.get("workspaceId") ?? undefined,
      documentId: url.searchParams.get("documentId") ?? undefined,
      resolved: url.searchParams.get("resolved") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const service = await createCommentService();
    const comments = await service.list(query.workspaceId, user.id, {
      documentId: query.documentId,
      resolved: query.resolved,
      limit: query.limit,
      offset: query.offset,
    });
    return apiSuccess({ comments });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(createCommentSchema, await req.json());

    const service = await createCommentService();
    const comment = await service.create(input.workspaceId, user.id, input);
    return apiSuccess({ comment });
  } catch (err) {
    return apiError(err);
  }
}
