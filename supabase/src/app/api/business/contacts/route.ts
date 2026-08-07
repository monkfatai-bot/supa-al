/**
 * Supa AI — Phase 10 contacts list + create route.
 *
 * GET  `/api/business/contacts?workspaceId=...` — list contacts.
 * POST `/api/business/contacts`                   — create a contact.
 *
 * @module @/app/api/business/contacts/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createContactService } from "@/lib/business";
import { validateInput } from "@/lib/validation";
import {
  createContactSchema,
  listContactsQuerySchema,
} from "@/lib/validation/business";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listContactsQuerySchema, {
      workspaceId: url.searchParams.get("workspaceId") ?? "",
      search: url.searchParams.get("search") ?? undefined,
      customerId: url.searchParams.get("customerId") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    const service = await createContactService();
    const contacts = await service.list(query.workspaceId, user.id, query);
    return apiSuccess({ contacts });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const body = (await req.json()) as Record<string, unknown>;
    const workspaceId = String(body.workspaceId ?? "");
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);
    const input = validateInput(createContactSchema, body);

    const service = await createContactService();
    const contact = await service.create(workspaceId, user.id, input);
    return apiSuccess({ contact });
  } catch (err) {
    return apiError(err);
  }
}
