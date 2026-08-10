"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import { dispatchEvent } from "@/services/automation/triggers";
import { hasMinimumRole } from "@/services/rbac/permissions";
import { verifyWorkspaceMembership } from "@/lib/workspace-utils";
import type { Role } from "@/services/rbac/types";
import { createNotification } from "@/services/notification/actions";
import type { CalendarEvent, CalendarEventType, ActivityAction } from "@/types/generated/database";
import type {
  CreateCalendarEventRequest,
  CalendarEventWithAttendees,
} from "./types";

// ─── Helpers ────────────────────────────────────────────────────



/**
 * Convert a raw calendar event row (with nested creator profile)
 * into a CalendarEventWithAttendees.
 */
function toEventWithCreator(
  row: Record<string, unknown>
): CalendarEventWithAttendees {
  const { creator, ...eventFields } = row;
  const creatorRaw = creator as unknown as
    | { full_name: string | null; avatar_url: string | null }
    | null;

  return {
    ...(eventFields as unknown as CalendarEvent),
    creator: creatorRaw
      ? { full_name: creatorRaw.full_name, avatar_url: creatorRaw.avatar_url }
      : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// CALENDAR EVENT CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new calendar event.
 */
export async function createCalendarEvent(
  data: CreateCalendarEventRequest
): Promise<{
  success: boolean;
  message: string;
  error?: string;
  event?: CalendarEvent;
}> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(data.workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const trimmedTitle = data.title.trim();
  if (!trimmedTitle || trimmedTitle.length < 1 || trimmedTitle.length > 500) {
    return { success: false, message: "Event title must be 1-500 characters.", error: "INVALID_TITLE" };
  }

  const insertPayload: Record<string, unknown> = {
    workspace_id: data.workspaceId,
    title: trimmedTitle,
    description: data.description?.trim() ?? "",
    event_type: data.eventType ?? ("event" as CalendarEventType),
    start_time: data.startTime,
    end_time: data.endTime ?? null,
    all_day: data.allDay ?? false,
    location: data.location?.trim() ?? "",
    attendees: data.attendees ?? [],
    reminders: data.reminders ?? [],
    recurrence_rule: data.recurrenceRule ?? null,
    tags: data.tags ?? [],
    created_by: profile.id,
    external_id: "",
    external_provider: "",
  };

  const { data: event, error } = await supabase
    .from("calendar_events")
    .insert(insertPayload)
    .select()
    .single();

  if (error || !event) {
    logger.error("Failed to create calendar event", { reason: error?.message });
    return { success: false, message: "Failed to create calendar event.", error: "CREATE_FAILED" };
  }

  logger.info("Calendar event created", { eventId: event.id, workspaceId: data.workspaceId });
  await logActivity(
    "calendar_event_create" as ActivityAction,
    `Created calendar event: ${trimmedTitle}`,
    { eventId: event.id },
    data.workspaceId
  );
  void dispatchEvent({ eventName: 'calendar.event_created', workspaceId: data.workspaceId, userId: profile.id, payload: { eventId: event.id, title: trimmedTitle, eventType: data.eventType }, timestamp: new Date().toISOString() }).catch(() => {});
  void createNotification(profile.id, "calendar", "New event created", `Event: ${trimmedTitle}`, "/business");
  revalidatePath("/business");
  return { success: true, message: "Calendar event created.", event };
}

/**
 * Update an existing calendar event.
 */
export async function updateCalendarEvent(
  eventId: string,
  workspaceId: string,
  updates: {
    title?: string;
    description?: string;
    eventType?: CalendarEventType;
    startTime?: string;
    endTime?: string;
    allDay?: boolean;
    location?: string;
    attendees?: string[];
    reminders?: Record<string, unknown>[];
    recurrenceRule?: Record<string, unknown> | null;
    tags?: string[];
  }
): Promise<{
  success: boolean;
  message: string;
  error?: string;
  event?: CalendarEvent;
}> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.title !== undefined) {
    const trimmed = updates.title.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 500) {
      return { success: false, message: "Event title must be 1-500 characters.", error: "INVALID_TITLE" };
    }
    dbUpdates.title = trimmed;
  }
  if (updates.description !== undefined) dbUpdates.description = updates.description.trim();
  if (updates.eventType !== undefined) dbUpdates.event_type = updates.eventType;
  if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
  if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
  if (updates.allDay !== undefined) dbUpdates.all_day = updates.allDay;
  if (updates.location !== undefined) dbUpdates.location = updates.location.trim();
  if (updates.attendees !== undefined) dbUpdates.attendees = updates.attendees;
  if (updates.reminders !== undefined) dbUpdates.reminders = updates.reminders;
  if (updates.recurrenceRule !== undefined) dbUpdates.recurrence_rule = updates.recurrenceRule;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;

  if (Object.keys(dbUpdates).length <= 1) {
    return { success: false, message: "No valid fields to update.", error: "NO_UPDATES" };
  }

  const { data: event, error } = await supabase
    .from("calendar_events")
    .update(dbUpdates)
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error || !event) {
    logger.error("Failed to update calendar event", { eventId, reason: error?.message });
    return { success: false, message: "Failed to update calendar event.", error: "UPDATE_FAILED" };
  }

  logger.info("Calendar event updated", { eventId });
  await logActivity(
    "calendar_event_update" as ActivityAction,
    `Updated calendar event: ${event.title}`,
    { eventId },
    workspaceId
  );
  void createNotification(profile.id, "calendar", "Event updated", `Event: ${event.title}`, "/business");
  revalidatePath("/business");
  return { success: true, message: "Calendar event updated.", event };
}

/**
 * Delete a calendar event.
 */
export async function deleteCalendarEvent(
  eventId: string,
  workspaceId: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  // Verify event exists in this workspace
  const { data: existing } = await supabase
    .from("calendar_events")
    .select("id, title")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!existing) {
    return { success: false, message: "Calendar event not found.", error: "NOT_FOUND" };
  }

  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", eventId)
    .eq("workspace_id", workspaceId);

  if (error) {
    logger.error("Failed to delete calendar event", { eventId, reason: error.message });
    return { success: false, message: "Failed to delete calendar event.", error: "DELETE_FAILED" };
  }

  logger.info("Calendar event deleted", { eventId, workspaceId });
  await logActivity(
    "calendar_event_delete" as ActivityAction,
    `Deleted calendar event: ${existing.title}`,
    { eventId },
    workspaceId
  );
  void createNotification(profile.id, "calendar", "Event deleted", `Event: ${existing.title}`, "/business");
  revalidatePath("/business");
  return { success: true, message: "Calendar event deleted." };
}

// ═══════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get calendar events for a workspace, optionally filtered by time range and type.
 */
export async function getCalendarEvents(
  workspaceId: string,
  filters?: {
    startTimeFrom?: string;
    startTimeTo?: string;
    eventType?: CalendarEventType;
  }
): Promise<CalendarEventWithAttendees[]> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) return [];

  let query = supabase
    .from("calendar_events")
    .select("*, creator:profiles!calendar_events_created_by_fkey(full_name, avatar_url)")
    .eq("workspace_id", workspaceId);

  if (filters?.startTimeFrom) {
    query = query.gte("start_time", filters.startTimeFrom);
  }
  if (filters?.startTimeTo) {
    query = query.lte("start_time", filters.startTimeTo);
  }
  if (filters?.eventType) {
    query = query.eq("event_type", filters.eventType);
  }

  query = query.order("start_time", { ascending: true });

  const { data, error } = await query;

  if (error || !data) {
    logger.error("Failed to fetch calendar events", { reason: error?.message });
    return [];
  }

  return (data as unknown as Record<string, unknown>[]).map(toEventWithCreator);
}

/**
 * Get a single calendar event by ID.
 */
export async function getCalendarEvent(
  eventId: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
  event?: CalendarEventWithAttendees;
}> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("calendar_events")
    .select("*, creator:profiles!calendar_events_created_by_fkey(full_name, avatar_url)")
    .eq("id", eventId)
    .single();

  if (error || !data) {
    return { success: false, message: "Calendar event not found.", error: "NOT_FOUND" };
  }

  // Verify workspace membership
  const membership = await verifyWorkspaceMembership(data.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const event = toEventWithCreator(data as unknown as Record<string, unknown>);

  return { success: true, message: "Calendar event retrieved.", event };
}

/**
 * Get upcoming events (start_time > now) ordered by start_time ASC.
 */
export async function getUpcomingEvents(
  workspaceId: string,
  limit?: number
): Promise<CalendarEventWithAttendees[]> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) return [];

  const now = new Date().toISOString();
  const effectiveLimit = Math.min(limit ?? 10, 100);

  const { data, error } = await supabase
    .from("calendar_events")
    .select("*, creator:profiles!calendar_events_created_by_fkey(full_name, avatar_url)")
    .eq("workspace_id", workspaceId)
    .gt("start_time", now)
    .order("start_time", { ascending: true })
    .limit(effectiveLimit);

  if (error || !data) {
    logger.error("Failed to fetch upcoming events", { reason: error?.message });
    return [];
  }

  return (data as unknown as Record<string, unknown>[]).map(toEventWithCreator);
}

/**
 * Sync a calendar event to an external provider (Google / Outlook)
 * via the Integration Hub's event bus.
 */
export async function syncToExternalCalendar(
  eventId: string,
  provider: "google" | "outlook"
): Promise<{ success: boolean; message: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: event } = await supabase
    .from("calendar_events")
    .select("id, workspace_id, title, description, start_time, end_time, location")
    .eq("id", eventId)
    .single();

  if (!event) {
    return { success: false, message: "Calendar event not found." };
  }

  const membership = await verifyWorkspaceMembership(event.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied." };
  }

  // Check for connected calendar integration
  const { data: account } = await supabase
    .from("integration_accounts")
    .select("id, integration_id, config")
    .eq("workspace_id", event.workspace_id)
    .eq("status", "active")
    .single();

  if (!account) {
    return {
      success: false,
      message: `No ${provider === "google" ? "Google Calendar" : "Outlook"} integration connected. Go to Integration Hub to connect one.`,
    };
  }

  // Dispatch sync event via the event bus for the integration hub to handle
  try {
    const { publishEvent } = await import("@/services/integration-hub/event-bus");
    await publishEvent({
      workspaceId: event.workspace_id,
      eventType: `calendar.sync.${provider}`,
      payload: {
        eventId: event.id,
        title: event.title,
        description: event.description ?? "",
        startTime: event.start_time,
        endTime: event.end_time,
        location: event.location ?? "",
        provider,
        integrationAccountId: account.id,
      },
    });

    logger.info("Calendar sync dispatched", { eventId, provider, integrationAccountId: account.id });
    return { success: true, message: `Sync to ${provider === "google" ? "Google Calendar" : "Outlook"} initiated. The event will be synced shortly.` };
  } catch (err) {
    logger.error("Failed to dispatch calendar sync", { eventId, provider, reason: err instanceof Error ? err.message : "Unknown" });
    return { success: false, message: "Failed to initiate calendar sync. Please try again." };
  }
}
