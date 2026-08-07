/**
 * Supa AI — Single-folder route.
 *
 * PATCH  `/api/chat/folders/:id`  — rename / recolor the folder.
 * DELETE `/api/chat/folders/:id`  — delete the folder. Conversations in
 *                                   the folder have their `folder_id` set
 *                                   to NULL (the FK has `on delete set
 *                                   null`).
 *
 * Both require a valid session + ownership of the folder.
 *
 * @module @/app/api/chat/folders/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { NotFoundError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesUpdate } from "@/lib/supabase/types";
import { validateInput } from "@/lib/validation";
import { updateFolderSchema } from "@/lib/validation/chat";

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
    if (!id) throw new NotFoundError("Folder");

    const input = validateInput(updateFolderSchema, await req.json());

    const supabase: AnySupabaseClient = await createSupabaseServerClient();
    const patch: TablesUpdate<"conversation_folders"> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.color !== undefined) patch.color = input.color;

    const { data, error } = await supabase
      .from("conversation_folders")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`folders.update failed: ${error.message}`);
    if (!data) throw new NotFoundError("Folder", id);

    return apiSuccess({ folder: data as Tables<"conversation_folders"> });
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
    if (!id) throw new NotFoundError("Folder");

    const supabase: AnySupabaseClient = await createSupabaseServerClient();
    const { error } = await supabase
      .from("conversation_folders")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw new Error(`folders.delete failed: ${error.message}`);

    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
