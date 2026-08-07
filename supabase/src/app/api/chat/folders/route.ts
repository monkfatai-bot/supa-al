/**
 * Supa AI — Conversation folders list + create route.
 *
 * GET  `/api/chat/folders`  — list the caller's folders (sorted by
 *                             `sort_order` then `created_at`).
 * POST `/api/chat/folders`  — create a new folder.
 *
 * Both require a valid session.
 *
 * @module @/app/api/chat/folders/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { NotFoundError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert } from "@/lib/supabase/types";
import { validateInput } from "@/lib/validation";
import { createFolderSchema } from "@/lib/validation/chat";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    // Use the narrow AnySupabaseClient view so supabase-js's column-string
    // type inference resolves against the hand-written Database type.
    const supabase: AnySupabaseClient = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("conversation_folders")
      .select()
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(`folders.list failed: ${error.message}`);

    return apiSuccess({ folders: (data ?? []) as Tables<"conversation_folders">[] });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(createFolderSchema, await req.json());

    const supabase: AnySupabaseClient = await createSupabaseServerClient();
    const payload: TablesInsert<"conversation_folders"> = {
      user_id: user.id,
      name: input.name,
      color: input.color ?? null,
    };
    const { data, error } = await supabase
      .from("conversation_folders")
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) throw new Error(`folders.create failed: ${error.message}`);
    if (!data) throw new NotFoundError("Folder");

    return apiSuccess({ folder: data as Tables<"conversation_folders"> });
  } catch (err) {
    return apiError(err);
  }
}
