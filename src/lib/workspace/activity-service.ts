/**
 * Supa AI — Phase 9 Workspace activity service.
 *
 * Owns the `workspace_activity` table — the audit feed of everything that
 * happens in a workspace (document created, member invited, comment
 * posted, etc.). Other services call {@link ActivityService.log} to record
 * an event; the UI reads via {@link ActivityService.list}.
 *
 * @module @/lib/workspace/activity-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type {
  ListActivityOptions,
  WorkspaceActivity,
} from "./types";
import {
  assertMember,
  toDbError,
  toJson,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

class ActivityService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * Paginated list of workspace activity, newest first. Optionally filter
   * by `resourceType`, `resourceId`, or `userId`.
   */
  async list(
    workspaceId: string,
    userId: string,
    opts: ListActivityOptions = {},
  ): Promise<WorkspaceActivity[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);

      let query = this.supabase
        .from("workspace_activity")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.resourceType) {
        query = query.eq("resource_type", opts.resourceType);
      }
      if (opts.resourceId) {
        query = query.eq("resource_id", opts.resourceId);
      }
      if (opts.userId) {
        query = query.eq("user_id", opts.userId);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "activity.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing activity.", {
        workspaceId,
      });
    }
  }

  /**
   * Record an activity event. Members-only (the caller must be in the
   * workspace). The insert is best-effort — failures are swallowed and
   * logged, since activity is non-critical telemetry.
   */
  async log(
    workspaceId: string,
    userId: string,
    action: string,
    metadata?: Record<string, unknown> | null,
    resourceType?: string | null,
    resourceId?: string | null,
  ): Promise<WorkspaceActivity | null> {
    if (!action?.trim()) {
      throw new ValidationError("Action is required.");
    }

    try {
      // Best-effort membership check — activity is non-critical, so we
      // never let a failed check block the calling operation.
      await assertMember(this.supabase, workspaceId, userId);

      const { data, error } = await this.supabase
        .from("workspace_activity")
        .insert({
          workspace_id: workspaceId,
          user_id: userId,
          action: action.trim(),
          resource_type: resourceType ?? null,
          resource_id: resourceId ?? null,
          metadata: toJson(metadata ?? null),
        } as never)
        .select()
        .maybeSingle();

      if (error) {
        // Swallow — non-critical.
        return null;
      }
      return data ?? null;
    } catch {
      // Swallow — activity logging is best-effort.
      return null;
    }
  }
}

export async function createActivityService(): Promise<ActivityService> {
  const supabase = await createSupabaseServerClient();
  return new ActivityService(supabase);
}

export { ActivityService };
