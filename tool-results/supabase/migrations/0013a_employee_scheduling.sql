-- =============================================================================
-- SUPA AI — 0013a_employee_scheduling.sql
-- Phase 9C+ — AI employee scheduling / availability metadata.
--
-- Adds three columns to the existing `ai_employees` table so individual
-- AI employees can declare working hours, a timezone, and an availability
-- flag. These power the upcoming "scheduling" UI (a calendar that shows
-- when each AI employee is online / reachable) without requiring a new
-- table.
--
--   working_hours : jsonb  — e.g.
--        { "mon": ["09:00-13:00","14:00-18:00"], "tue": [...], ... }
--        Empty object `{}` means "always on" (the previous behavior).
--   timezone       : text   — IANA tz name (e.g. 'America/New_York').
--        Defaults to 'UTC' so every row has a determinstic tz.
--   is_available   : bool   — quick kill-switch for the scheduling UI
--        without mutating `working_hours`. Defaults to true.
--
-- All three columns are NOT NULL with defaults so the migration is safe
-- to apply against any existing row in `ai_employees` — no backfill is
-- required.
-- =============================================================================

alter table public.ai_employees
  add column if not exists working_hours jsonb not null default '{}',
  add column if not exists timezone      text   not null default 'UTC',
  add column if not exists is_available  boolean not null default true;

-- Helpful index for the scheduling UI's "who is online right now?" query.
create index if not exists ai_employees_available_idx
  on public.ai_employees (workspace_id, is_available)
  where is_available = true;
