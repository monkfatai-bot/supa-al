/**
 * Supa AI — Phase 9C employee training list + add route.
 *
 * GET  `/api/employees/:id/training`  — list training sources.
 * POST `/api/employees/:id/training`  — add a training source.
 *   Body shape (discriminated by `source`):
 *     { source: "url", url, title? }      — train from a URL.
 *     { source: "document", documentId,
 *       title?, content }                  — train from a document.
 *
 * @module @/app/api/employees/[id]/training/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import {
  trainFromDocumentSchema,
  trainFromUrlSchema,
} from "@/lib/validation/employees";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");

    const service = createEmployeeService();
    const training = await service.listTraining(id);
    return apiSuccess({ training });
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
    if (!id) throw new NotFoundError("Employee");

    const body = (await req.json()) as { source?: string } & Record<string, unknown>;
    if (!body.source || typeof body.source !== "string") {
      throw new ValidationError("`source` is required (\"url\" or \"document\").");
    }

    const service = createEmployeeService();
    let training;
    if (body.source === "url") {
      const input = validateInput(trainFromUrlSchema, body);
      training = await service.trainFromUrl(id, user.id, user.id, input);
    } else if (body.source === "document") {
      const input = validateInput(trainFromDocumentSchema, body);
      training = await service.trainFromDocument(
        id,
        user.id,
        user.id,
        input.documentId,
        input.title ?? input.documentId,
        input.content,
      );
    } else {
      throw new ValidationError(`Unknown training source: "${body.source}".`);
    }
    return apiSuccess({ training });
  } catch (err) {
    return apiError(err);
  }
}
