/**
 * Supa AI — Single-conversation route.
 *
 * GET    `/api/chat/conversations/:id`  — fetch a single conversation.
 * PATCH  `/api/chat/conversations/:id`  — rename / pin / archive / move.
 * DELETE `/api/chat/conversations/:id`  — hard-delete (cascades to messages).
 *
 * All methods require a valid session + ownership of the conversation.
 *
 * @module @/app/api/chat/conversations/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createConversationService } from "@/lib/chat";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updateConversationSchema } from "@/lib/validation/chat";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Conversation");

    const service = await createConversationService();
    const conversation = await service.get(user.id, id);
    if (!conversation) throw new NotFoundError("Conversation", id);

    return apiSuccess({ conversation });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Conversation");

    const input = validateInput(updateConversationSchema, await req.json());

    const service = await createConversationService();

    // Apply each provided field via its focused service method. The schema
    // is strict, so unknown fields are rejected upstream. Fields are applied
    // in the order: rename → pin → archive → move, so the final row reflects
    // every requested mutation.
    let conversation = await service.get(user.id, id);
    if (!conversation) throw new NotFoundError("Conversation", id);

    if (input.title !== undefined) {
      conversation = await service.rename(user.id, id, input.title);
    }
    if (input.pinned !== undefined) {
      conversation = await service.pin(user.id, id, input.pinned);
    }
    if (input.archived !== undefined) {
      conversation = await service.archive(user.id, id, input.archived);
    }
    if (input.folderId !== undefined) {
      conversation = await service.moveToFolder(user.id, id, input.folderId);
    }

    return apiSuccess({ conversation });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Conversation");

    const service = await createConversationService();
    await service.delete(user.id, id);

    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
