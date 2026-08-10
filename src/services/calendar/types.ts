import type { CalendarEvent, CalendarEventType } from "@/types/generated/database";

// ─── Request DTOs ──────────────────────────────────────────────

export interface CreateCalendarEventRequest {
  workspaceId: string;
  title: string;
  description?: string;
  eventType?: CalendarEventType;
  startTime: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  attendees?: string[];
  reminders?: Record<string, unknown>[];
  recurrenceRule?: Record<string, unknown> | null;
  tags?: string[];
}

// ─── Composite response types ──────────────────────────────────

export interface CalendarEventWithAttendees extends CalendarEvent {
  creator?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

// ─── Re-exports ────────────────────────────────────────────────

export type { CalendarEvent, CalendarEventType };
