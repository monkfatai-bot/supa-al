/**
 * Supa AI — Phase 9 workspace documents route.
 *
 * GET  `/api/workspace/workspaces/:id/documents` — list documents.
 * POST `/api/workspace/workspaces/:id/documents` — create a document.
 *
 * @module @/app/api/workspace/workspaces/[id]/documents/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createDocumentService } from "@/lib/workspace";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import {
  createDocumentSchema,
  listDocumentsQuerySchema,
} from "@/lib/validation/workspace";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Workspace");

    const url = new URL(req.url);
    const query = validateInput(listDocumentsQuerySchema, {
      folderId: url.searchParams.get("folderId") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const service = await createDocumentService();
    const documents = await service.list(id, user.id, query);
    return apiSuccess({ documents });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Workspace");

    const input = validateInput(createDocumentSchema, await req.json());

    const service = await createDocumentService();
    const document = await service.create(id, user.id, input);
    return apiSuccess({ document });
  } catch (err) {
    return apiError(err);
  }
}
