/**
 * Supa AI — Conversations list + create route.
 *
 * GET  `/api/chat/conversations`  — paginated list of the caller's
 *                                   conversations (pinned first, then by
 *                                   last_message_at desc). Query params:
 *                                   `archived`, `folderId`, `search`,
 *                                   `limit`, `offset`.
 * POST `/api/chat/conversations`  — create a new conversation.
 *
 * Both require a valid session.
 *
 * @module @/app/api/chat/conversations/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createConversationService } from "@/lib/chat";
import { validateInput } from "@/lib/validation";
import {
  createConversationSchema,
  searchConversationsSchema,
} from "@/lib/validation/chat";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);

    // Validate query params. `archived` defaults to "false"; the search
    // schema is only applied when `search` is present.
    const archivedParam = url.searchParams.get("archived");
    const archived = archivedParam === "true";
    const folderId = url.searchParams.get("folderId") ?? undefined;
    const searchRaw = url.searchParams.get("search");
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");

    let search: string | undefined;
    if (searchRaw) {
      const parsed = validateInput(searchConversationsSchema, {
        query: searchRaw,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      search = parsed.query;
    }

    const service = await createConversationService();
    const conversations = await service.list(user.id, {
      archived,
      folderId: folderId ?? undefined,
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    return apiSuccess({ conversations });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(createConversationSchema, await req.json());

    const service = await createConversationService();
    const conversation = await service.create(user.id, input);

    return apiSuccess({ conversation });
  } catch (err) {
    return apiError(err);
  }
}
