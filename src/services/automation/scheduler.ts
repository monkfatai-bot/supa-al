/**
 * Scheduling system for automated workflow execution.
 * Supports one-time, daily, weekly, monthly, and cron-based schedules.
 * Uses a polling approach compatible with serverless environments.
 */

import { createAdminClient } from "@/lib/supabase/admin-client";
import { logger } from "@/services/logger";
import type { ScheduleType, ScheduledJobStatus } from "./types";
import type { Json } from "@/types/generated/database";

/**
 * Calculate the next run time based on schedule configuration.
 */
export function calculateNextRunTime(
  scheduleType: ScheduleType,
  cronExpression: string,
  _timezone: string,
  afterDate?: Date,
): Date | null {
  void _timezone;
  const now = afterDate ?? new Date();

  switch (scheduleType) {
    case "once":
      // For once, parse the cron or return null if already past
      if (!cronExpression) return null;
      try {
        const scheduledDate = new Date(cronExpression);
        return scheduledDate > now ? scheduledDate : null;
      } catch {
        return null;
      }

    case "daily": {
      const next = new Date(now);
      const [hours, minutes] = (cronExpression || "0 9").split(" ").map(Number);
      next.setHours(hours || 9, minutes || 0, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }

    case "weekly": {
      const next = new Date(now);
      const parts = (cronExpression || "1 0 9").split(" ").map(Number);
      const dayOfWeek = parts[0] || 1; // 0=Sun, 1=Mon, ...
      const hours = parts[1] || 9;
      const minutes = parts[2] || 0;
      next.setHours(hours, minutes, 0, 0);
      const currentDay = next.getDay();
      let daysUntil = dayOfWeek - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      next.setDate(next.getDate() + daysUntil);
      return next;
    }

    case "monthly": {
      const next = new Date(now);
      const parts = (cronExpression || "1 0 9").split(" ").map(Number);
      const dayOfMonth = parts[0] || 1;
      const hours = parts[1] || 9;
      const minutes = parts[2] || 0;
      next.setDate(dayOfMonth);
      next.setHours(hours, minutes, 0, 0);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
      }
      return next;
    }

    case "cron": {
      // Simplified cron parser for common patterns
      // Full cron parsing would require a library; this handles standard 5-field cron
      if (!cronExpression) return null;
      return parseCronNextRun(cronExpression, now);
    }

    default:
      return null;
  }
}

/**
 * Simplified cron next-run calculator.
 * Supports standard 5-field cron: minute hour day month weekday
 */
function parseCronNextRun(cronExpression: string, afterDate: Date): Date | null {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const [minutePart, hourPart, dayPart, monthPart, weekdayPart] = parts;

  const next = new Date(afterDate);
  next.setSeconds(0, 0);
  next.setTime(next.getTime() + 60_000);

  // Try the next 366 days to find a match
  const maxIterations = 525960; // 1 year in minutes
  for (let i = 0; i < maxIterations; i++) {
    if (
      cronFieldMatches(minutePart, next.getMinutes()) &&
      cronFieldMatches(hourPart, next.getHours()) &&
      cronFieldMatches(dayPart, next.getDate()) &&
      cronFieldMatches(monthPart, next.getMonth() + 1) &&
      cronFieldMatches(weekdayPart, next.getDay())
    ) {
      return next;
    }
    next.setTime(next.getTime() + 60_000);
  }

  return null;
}

/**
 * Check if a cron field value matches the current value.
 */
function cronFieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;

  // Handle step values (e.g., */5)
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step <= 0) return false;
    return value % step === 0;
  }

  // Handle ranges (e.g., 1-5)
  if (field.includes("-")) {
    const [start, end] = field.split("-").map(Number);
    return value >= start && value <= end;
  }

  // Handle comma-separated values (e.g., 1,3,5)
  if (field.includes(",")) {
    return field.split(",").map((v) => parseInt(v.trim(), 10)).includes(value);
  }

  // Simple numeric value
  const num = parseInt(field, 10);
  return !isNaN(num) && num === value;
}

/**
 * Poll for and execute due scheduled jobs.
 * This should be called periodically (e.g., every minute via a cron job).
 */
export async function processScheduledJobs(): Promise<{ processed: number; errors: number }> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Find all active scheduled jobs that are due
  const { data: jobs, error } = await supabase
    .from("scheduled_jobs")
    .select("*")
    .eq("status", "active" as ScheduledJobStatus)
    .lte("next_run_at", now)
    .order("next_run_at", { ascending: true })
    .limit(50);

  if (error || !jobs || jobs.length === 0) {
    return { processed: 0, errors: 0 };
  }

  let processed = 0;
  let errors = 0;

  for (const job of jobs) {
    // Check max_runs limit
    if (job.max_runs !== null && job.run_count >= job.max_runs) {
      await supabase
        .from("scheduled_jobs")
        .update({ status: "completed" as ScheduledJobStatus })
        .eq("id", job.id);
      continue;
    }

    try {
      const { executeWorkflowByTrigger } = await import("./engine");
      await executeWorkflowByTrigger({
        workflowId: job.workflow_id,
        workspaceId: job.workspace_id,
        triggerType: "schedule",
        inputData: { _scheduledJobId: job.id, _scheduleConfig: job.config } as unknown as Json,
      });

      // Calculate next run time
      const nextRun = calculateNextRunTime(
        job.schedule_type,
        job.cron_expression,
        job.timezone,
      );

      await supabase
        .from("scheduled_jobs")
        .update({
          last_run_at: now,
          next_run_at: nextRun ? nextRun.toISOString() : null,
          run_count: job.run_count + 1,
        })
        .eq("id", job.id);

      processed++;
    } catch (error) {
      errors++;
      logger.error("Scheduled job execution failed", {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });

      await supabase
        .from("scheduled_jobs")
        .update({ status: "failed" as ScheduledJobStatus })
        .eq("id", job.id);
    }
  }

  if (processed > 0 || errors > 0) {
    logger.info("Scheduled job processing complete", { processed, errors, total: jobs.length });
  }

  return { processed, errors };
}
