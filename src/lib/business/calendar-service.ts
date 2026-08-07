/**
 * Supa AI — Phase 10 calendar service (server-only).
 *
 * Owns the `calendar_events` table. CRUD + date-range queries (the
 * calendar UI's primary access pattern).
 *
 * @module @/lib/business/calendar-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

import type {
  CalendarEvent,
  CreateCalendarEventInput,
  ListCalendarEventsOptions,
  UpdateCalendarEventInput,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 365;

export class CalendarEventService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: ListCalendarEventsOptions = {},
  ): Promise<CalendarEvent[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("calendar_events")
        .select()
        .eq("workspace_id", workspaceId)
        .order("start_time", { ascending: true })
        .range(offset, offset + limit - 1);

      if (opts.type) query = query.eq("type", opts.type);
      if (opts.dateFrom) query = query.gte("start_time", opts.dateFrom);
      if (opts.dateTo) query = query.lte("start_time", opts.dateTo);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "calendar_events.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing calendar events.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    eventId: string,
  ): Promise<CalendarEvent> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("calendar_events")
        .select()
        .eq("id", eventId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "calendar_events.get failed");
      if (!data) throw new NotFoundError("CalendarEvent", eventId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching calendar event.", {
        eventId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateCalendarEventInput,
  ): Promise<CalendarEvent> {
    const title = input.title?.trim();
    if (!title) throw new ValidationError("Event title is required.");
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("calendar_events")
        .insert({
          workspace_id: workspaceId,
          title,
          description: input.description ?? null,
          type: input.type ?? "event",
          start_time: input.startTime ?? new Date().toISOString(),
          end_time: input.endTime ?? null,
          all_day: input.allDay ?? false,
          location: input.location ?? null,
          attendees: (input.attendees ?? []) as never,
          reminder_minutes: input.reminderMinutes ?? 0,
          recurrence: (input.recurrence ?? null) as never,
          created_by: userId,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "calendar_events.create failed");
      if (!data) throw new NotFoundError("CalendarEvent create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating calendar event.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    eventId: string,
    input: UpdateCalendarEventInput,
  ): Promise<CalendarEvent> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.type !== undefined) patch.type = input.type;
    if (input.startTime !== undefined) patch.start_time = input.startTime;
    if (input.endTime !== undefined) patch.end_time = input.endTime;
    if (input.allDay !== undefined) patch.all_day = input.allDay;
    if (input.location !== undefined) patch.location = input.location;
    if (input.attendees !== undefined) patch.attendees = input.attendees as never;
    if (input.reminderMinutes !== undefined) patch.reminder_minutes = input.reminderMinutes;
    if (input.recurrence !== undefined) patch.recurrence = input.recurrence as never;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("calendar_events")
        .update(patch as never)
        .eq("id", eventId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "calendar_events.update failed");
      if (!data) throw new NotFoundError("CalendarEvent", eventId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating calendar event.", {
        eventId,
      });
    }
  }

  async delete(
    workspaceId: string,
    userId: string,
    eventId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("calendar_events")
        .delete()
        .eq("id", eventId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "calendar_events.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting calendar event.", {
        eventId,
      });
    }
  }
}

export async function createCalendarEventService(): Promise<CalendarEventService> {
  const supabase = await createSupabaseServerClient();
  return new CalendarEventService(supabase);
}
