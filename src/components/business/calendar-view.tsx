"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  MapPin,
  Clock,
  Users,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getCalendarEvents, createCalendarEvent, deleteCalendarEvent } from "@/services/calendar";
import type { CalendarEventWithAttendees, CalendarEventType } from "@/services/calendar";

interface CalendarViewProps {
  workspaceId: string;
}

const EVENT_TYPE_COLORS: Record<CalendarEventType, string> = {
  meeting: "bg-blue-500",
  reminder: "bg-amber-500",
  deadline: "bg-red-500",
  event: "bg-green-500",
};

const EVENT_TYPE_BADGE_VARIANTS: Record<CalendarEventType, "default" | "secondary" | "destructive" | "outline"> = {
  meeting: "default",
  reminder: "secondary",
  deadline: "destructive",
  event: "outline",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function renderDayCell(
  day: number | null,
  idx: number,
  currentYear: number,
  currentMonth: number,
  today: Date,
  selectedDate: string | null,
  eventsByDate: Map<string, CalendarEventWithAttendees[]>,
  onDayClick: (dateStr: string) => void,
) {
  if (day === null) {
    return <div key={`empty-${idx}`} className="bg-card min-h-24 p-1" />;
  }
  const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const isToday = dateStr === toLocalDateString(today);
  const isSelected = dateStr === selectedDate;
  const dayEvents = eventsByDate.get(dateStr) ?? [];
  return (
    <button
      key={day}
      onClick={() => onDayClick(dateStr)}
      className={`bg-card min-h-24 cursor-pointer p-1 text-left transition-colors hover:bg-accent/30 ${isSelected ? "ring-2 ring-primary ring-inset" : ""}`}
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${isToday ? "bg-primary text-primary-foreground" : ""}`}
      >
        {day}
      </span>
      <div className="mt-0.5 space-y-0.5">
        {dayEvents.slice(0, 3).map((ev) => (
          <div
            key={ev.id}
            className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] text-white ${EVENT_TYPE_COLORS[ev.event_type] || "bg-gray-500"}`}
          >
            <span className="truncate">{ev.title}</span>
          </div>
        ))}
        {dayEvents.length > 3 && (
          <span className="text-muted-foreground block px-1 text-[10px]">
            +{dayEvents.length - 3} more
          </span>
        )}
      </div>
    </button>
  );
}

export function CalendarView({ workspaceId }: CalendarViewProps) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEventWithAttendees[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: "",
    eventType: "meeting" as CalendarEventType,
    startTime: "",
    endTime: "",
    location: "",
    attendees: "",
  });
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const monthStart = useMemo(
    () => `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`,
    [currentYear, currentMonth]
  );
  const daysInMonth = useMemo(
    () => getDaysInMonth(currentYear, currentMonth),
    [currentYear, currentMonth]
  );
  const monthEnd = useMemo(
    () => `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`,
    [currentYear, currentMonth, daysInMonth]
  );

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCalendarEvents(workspaceId, {
        startTimeFrom: monthStart,
        startTimeTo: `${monthEnd}T23:59:59`,
      });
      setEvents(data);
    } catch {
      toast.error("Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, monthStart, monthEnd]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDate(null);
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDate(null);
  }

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventWithAttendees[]>();
    for (const ev of events) {
      const dateStr = toLocalDateString(new Date(ev.start_time));
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(ev);
    }
    return map;
  }, [events]);

  const selectedDayEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : [];

  function handleDayClick(dateStr: string) {
    setSelectedDate(dateStr === selectedDate ? null : dateStr);
  }

  async function handleCreateEvent() {
    if (!newEvent.title.trim() || !newEvent.startTime) {
      toast.error("Title and start time are required");
      return;
    }
    setCreating(true);
    try {
      const attendees = newEvent.attendees
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await createCalendarEvent({
        workspaceId,
        title: newEvent.title.trim(),
        eventType: newEvent.eventType,
        startTime: newEvent.startTime,
        endTime: newEvent.endTime || undefined,
        location: newEvent.location || undefined,
        attendees,
      });
      if (res.success) {
        toast.success("Event created");
        setAddDialogOpen(false);
        setNewEvent({
          title: "",
          eventType: "meeting",
          startTime: "",
          endTime: "",
          location: "",
          attendees: "",
        });
        fetchEvents();
      } else {
        toast.error(res.message || "Failed to create event");
      }
    } catch {
      toast.error("Failed to create event");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteEvent(eventId: string) {
    setDeletingId(eventId);
    try {
      const res = await deleteCalendarEvent(eventId, workspaceId);
      if (res.success) {
        toast.success("Event deleted");
        fetchEvents();
      } else {
        toast.error(res.message || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete event");
    } finally {
      setDeletingId(null);
    }
  }

  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const allDays = cells;

  const dayCells = allDays.map((day, idx) =>
    renderDayCell(day, idx, currentYear, currentMonth, today, selectedDate, eventsByDate, handleDayClick)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground text-sm">Events, meetings, deadlines, and reminders.</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Event
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>New Event</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label htmlFor="evt-title">Title *</Label>
                <Input
                  id="evt-title"
                  placeholder="Event title"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent((ev) => ({ ...ev, title: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={newEvent.eventType}
                    onValueChange={(v) =>
                      setNewEvent((ev) => ({ ...ev, eventType: v as CalendarEventType }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="reminder">Reminder</SelectItem>
                      <SelectItem value="deadline">Deadline</SelectItem>
                      <SelectItem value="event">Event</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="evt-start">Start *</Label>
                  <Input
                    id="evt-start"
                    type="datetime-local"
                    value={newEvent.startTime}
                    onChange={(e) => setNewEvent((ev) => ({ ...ev, startTime: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="evt-end">End</Label>
                  <Input
                    id="evt-end"
                    type="datetime-local"
                    value={newEvent.endTime}
                    onChange={(e) => setNewEvent((ev) => ({ ...ev, endTime: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="evt-location">Location</Label>
                  <Input
                    id="evt-location"
                    placeholder="Office / Zoom"
                    value={newEvent.location}
                    onChange={(e) => setNewEvent((ev) => ({ ...ev, location: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="evt-attendees">Attendees (comma-separated)</Label>
                <Input
                  id="evt-attendees"
                  placeholder="user@example.com, jane@example.com"
                  value={newEvent.attendees}
                  onChange={(e) => setNewEvent((ev) => ({ ...ev, attendees: e.target.value }))}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCreateEvent}
                disabled={creating || !newEvent.title.trim() || !newEvent.startTime}
              >
                {creating ? "Creating..." : "Create Event"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <CardTitle className="text-lg">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[640px] grid-cols-7 gap-px rounded-lg border bg-border">
                {DAY_NAMES.map((name) => (
                  <div
                    key={name}
                    className="bg-muted/50 p-2 text-center text-xs font-semibold uppercase tracking-wide"
                  >
                    {name}
                  </div>
                ))}
                {dayCells}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {(Object.keys(EVENT_TYPE_COLORS) as CalendarEventType[]).map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={`h-3 w-3 rounded-full ${EVENT_TYPE_COLORS[type]}`} />
            <span className="text-xs capitalize">{type}</span>
          </div>
        ))}
      </div>

      {selectedDate && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Events on {selectedDate}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDayEvents.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">No events on this day.</p>
            ) : (
              <div className="space-y-3">
                {selectedDayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${EVENT_TYPE_COLORS[ev.event_type] || "bg-gray-500"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{ev.title}</p>
                          <Badge variant={EVENT_TYPE_BADGE_VARIANTS[ev.event_type]} className="mt-1">
                            {ev.event_type}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteEvent(ev.id)}
                          disabled={deletingId === ev.id}
                        >
                          {deletingId === ev.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(ev.start_time)}
                          {ev.end_time ? ` - ${formatTime(ev.end_time)}` : ""}
                        </span>
                        {ev.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {ev.location}
                          </span>
                        )}
                        {ev.attendees && ev.attendees.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {ev.attendees.length} attendee{ev.attendees.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
