/**
 * Supa AI — Single-message route.
 *
 * PATCH  `/api/chat/messages/:id`  — edit a message's content. Only
 *                                   user-role messages can be edited
 *                                   (assistant messages are immutable —
 *                                   edits go through regenerate). The
 *                                   prior content is preserved in
 *                                   `edit_history`.
 * DELETE `/api/chat/messages/:id`  — hard-delete the message.
 *
 * Both require a valid session + ownership (verified via the parent
 * conversation's `user_id`).
 *
 * @module @/app/api/chat/messages/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createMessageService } from "@/lib/chat";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { editMessageSchema } from "@/lib/validation/chat";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Message");

    const input = validateInput(editMessageSchema, await req.json());

    const service = await createMessageService();
    const message = await service.update(user.id, id, input.content);

    return apiSuccess({ message });
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
    if (!id) throw new NotFoundError("Message");

    const service = await createMessageService();
    await service.delete(user.id, id);

    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
