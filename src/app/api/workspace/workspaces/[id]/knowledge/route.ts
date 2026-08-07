/**
 * Supa AI — Phase 9 workspace knowledge base route.
 *
 * GET  `/api/workspace/workspaces/:id/knowledge` — list articles.
 * POST `/api/workspace/workspaces/:id/knowledge` — create an article.
 *
 * @module @/app/api/workspace/workspaces/[id]/knowledge/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createKnowledgeService } from "@/lib/workspace";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import {
  createKnowledgeArticleSchema,
  listKnowledgeQuerySchema,
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
    const query = validateInput(listKnowledgeQuerySchema, {
      search: url.searchParams.get("search") ?? undefined,
      tag: url.searchParams.get("tag") ?? undefined,
      sourceType: url.searchParams.get("sourceType") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const service = await createKnowledgeService();
    const articles = await service.list(id, user.id, query);
    return apiSuccess({ articles });
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

    const input = validateInput(createKnowledgeArticleSchema, await req.json());

    const service = await createKnowledgeService();
    const article = await service.create(id, user.id, input);
    return apiSuccess({ article });
  } catch (err) {
    return apiError(err);
  }
}
