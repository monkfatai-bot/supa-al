/**
 * Supa AI — Phase 9A Automation — templates list + create route.
 *
 * GET  `/api/automation/templates`  — browse automation templates (public).
 * POST `/api/automation/templates`  — publish a new template (auth required).
 *
 * @module @/app/api/automation/templates/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAutomationService } from "@/lib/automation";
import { validateInput } from "@/lib/validation";
import {
  createTemplateSchema,
  listTemplatesQuerySchema,
} from "@/lib/validation/automation";
import { parseJsonBody } from "../_helpers";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    // Templates are browseable by anyone — no auth gate.
    const url = new URL(req.url);
    const query = validateInput(listTemplatesQuerySchema, {
      category: url.searchParams.get("category") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      featured: url.searchParams.get("featured") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const service = createAutomationService();
    const templates = await service.listTemplates(query);
    return apiSuccess({ templates });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const body = await parseJsonBody(req);
    const input = validateInput(createTemplateSchema, body);

    const service = createAutomationService();
    const template = await service.createTemplate(user.id, input);
    return apiSuccess({ template });
  } catch (err) {
    return apiError(err);
  }
}
