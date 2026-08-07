-- =============================================================================
-- SUPA AI — 0018_phase12_supa_os_runtime.sql
-- Phase 12: Supa OS Runtime & Multi-Agent Orchestration Platform
--
-- Tables (10):
--   1.  runtime_sessions   -- active runtime sessions (per workspace)
--   2.  runtime_processes   -- executing agent/workflow processes
--   3.  runtime_tasks      -- queued + executing tasks
--   4.  runtime_events      -- runtime event log
--   5.  runtime_contexts    -- shared execution context snapshots
--   6.  runtime_metrics     -- per-session resource usage metrics
--   7.  runtime_logs        -- structured runtime logs
--   8.  runtime_resources   -- resource allocation + limits per workspace
--   9.  runtime_schedules   -- scheduled + recurring execution configs
--  10.  runtime_recovery    -- crash recovery + checkpoint records
--
-- Design:
--   • Workspace-scoped with default-deny RLS via is_workspace_member().
--   • All tables have updated_at triggers.
--   • Indexes optimized for high-volume task/event queries.
-- =============================================================================

-- 1. runtime_sessions — active runtime instances per workspace
create table if not exists public.runtime_sessions (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  status          text not null default 'active' check (status in ('active','paused','stopped','crashed','recovering')),
  session_type    text not null default 'standard' check (session_type in ('standard','orchestrated','scheduled','recovery')),
  config          jsonb not null default '{}',
  started_by      uuid not null references auth.users (id) on delete set null,
  started_at      timestamptz not null default now(),
  stopped_at      timestamptz,
  pid             text,                               -- process ID (for external monitoring)
  host            text,                               -- server host (for multi-instance)
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.runtime_sessions enable row level security;
create index if not exists rt_sessions_ws_idx on public.runtime_sessions (workspace_id, started_at desc);
create index if not exists rt_sessions_status_idx on public.runtime_sessions (workspace_id, status);
drop policy if exists "rt_sessions_ws" on public.runtime_sessions;
create policy "rt_sessions_ws" on public.runtime_sessions for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_sessions_ws_w" on public.runtime_sessions;
create policy "rt_sessions_ws_w" on public.runtime_sessions for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()) and started_by = auth.uid());
drop policy if exists "rt_sessions_ws_u" on public.runtime_sessions;
create policy "rt_sessions_ws_u" on public.runtime_sessions for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_sessions_ws_d" on public.runtime_sessions;
create policy "rt_sessions_ws_d" on public.runtime_sessions for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- 2. runtime_processes — executing agent/workflow processes
create table if not exists public.runtime_processes (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.runtime_sessions (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  process_type    text not null check (process_type in ('agent','workflow','task','supervisor','worker','scheduler','monitor')),
  process_ref_id  uuid,                               -- FK to ai_employees.id / workflows.id / runtime_tasks.id
  process_ref_type text,                              -- 'ai_employee' | 'workflow' | 'task'
  name            text not null,
  status          text not null default 'pending' check (status in ('pending','running','paused','completed','failed','cancelled','crashed')),
  priority        integer not null default 5 check (priority >= 1 and priority <= 10),
  parent_process_id uuid references public.runtime_processes (id) on delete set null,
  assigned_to     text,                               -- agent/worker identifier
  started_at      timestamptz,
  completed_at    timestamptz,
  error           text,
  result          jsonb not null default '{}',
  tokens_used     bigint not null default 0,
  credits_used    integer not null default 0,
  duration_ms     integer,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.runtime_processes enable row level security;
create index if not exists rt_proc_session_idx on public.runtime_processes (session_id, created_at desc);
create index if not exists rt_proc_ws_idx on public.runtime_processes (workspace_id, status);
create index if not exists rt_proc_status_idx on public.runtime_processes (status, priority desc);
create index if not exists rt_proc_parent_idx on public.runtime_processes (parent_process_id);
create index if not exists rt_proc_ref_idx on public.runtime_processes (process_ref_type, process_ref_id);
drop policy if exists "rt_proc_ws" on public.runtime_processes;
create policy "rt_proc_ws" on public.runtime_processes for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_proc_ws_w" on public.runtime_processes;
create policy "rt_proc_ws_w" on public.runtime_processes for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_proc_ws_u" on public.runtime_processes;
create policy "rt_proc_ws_u" on public.runtime_processes for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_proc_ws_d" on public.runtime_processes;
create policy "rt_proc_ws_d" on public.runtime_processes for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- 3. runtime_tasks — queued + executing tasks
create table if not exists public.runtime_tasks (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid references public.runtime_sessions (id) on delete set null,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  process_id      uuid references public.runtime_processes (id) on delete set null,
  task_type       text not null check (task_type in ('chat','image','video','voice','sync','webhook','workflow_action','agent_action','business','custom')),
  name            text not null,
  description     text,
  status          text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled','timeout','retrying')),
  priority        integer not null default 5 check (priority >= 1 and priority <= 10),
  payload         jsonb not null default '{}',
  result          jsonb not null default '{}',
  error           text,
  retry_count     integer not null default 0,
  max_retries     integer not null default 3,
  timeout_ms      integer not null default 30000,
  started_at      timestamptz,
  completed_at    timestamptz,
  next_retry_at   timestamptz,
  scheduled_for   timestamptz,                         -- for delayed/scheduled tasks
  assigned_agent_id uuid,                              -- which AI employee is handling this
  tokens_used     bigint not null default 0,
  credits_used    integer not null default 0,
  metadata        jsonb not null default '{}',
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.runtime_tasks enable row level security;
create index if not exists rt_tasks_ws_idx on public.runtime_tasks (workspace_id, created_at desc);
create index if not exists rt_tasks_status_idx on public.runtime_tasks (status, priority desc);
create index if not exists rt_tasks_session_idx on public.runtime_tasks (session_id);
create index if not exists rt_tasks_scheduled_idx on public.runtime_tasks (scheduled_for) where status = 'queued' and scheduled_for is not null;
create index if not exists rt_tasks_retry_idx on public.runtime_tasks (next_retry_at) where status = 'retrying';
create index if not exists rt_tasks_agent_idx on public.runtime_tasks (assigned_agent_id);
drop policy if exists "rt_tasks_ws" on public.runtime_tasks;
create policy "rt_tasks_ws" on public.runtime_tasks for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_tasks_ws_w" on public.runtime_tasks;
create policy "rt_tasks_ws_w" on public.runtime_tasks for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_tasks_ws_u" on public.runtime_tasks;
create policy "rt_tasks_ws_u" on public.runtime_tasks for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_tasks_ws_d" on public.runtime_tasks;
create policy "rt_tasks_ws_d" on public.runtime_tasks for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- 4. runtime_events — runtime event log (for monitoring + audit)
create table if not exists public.runtime_events (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  session_id      uuid references public.runtime_sessions (id) on delete cascade,
  process_id      uuid references public.runtime_processes (id) on delete cascade,
  task_id         uuid references public.runtime_tasks (id) on delete cascade,
  event_type      text not null,                       -- 'process.started' | 'task.completed' | 'agent.message' | etc.
  category        text not null check (category in ('lifecycle','task','agent','workflow','resource','error','recovery','communication')),
  level           text not null default 'info' check (level in ('debug','info','warn','error','fatal')),
  message         text not null,
  payload         jsonb not null default '{}',
  source          text,                                -- which component emitted this event
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
alter table public.runtime_events enable row level security;
create index if not exists rt_events_ws_idx on public.runtime_events (workspace_id, created_at desc);
create index if not exists rt_events_session_idx on public.runtime_events (session_id, created_at desc);
create index if not exists rt_events_type_idx on public.runtime_events (event_type, created_at desc);
create index if not exists rt_events_category_idx on public.runtime_events (category, level, created_at desc);
create index if not exists rt_events_level_idx on public.runtime_events (workspace_id, level, created_at desc);
drop policy if exists "rt_events_ws" on public.runtime_events;
create policy "rt_events_ws" on public.runtime_events for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_events_ws_w" on public.runtime_events;
create policy "rt_events_ws_w" on public.runtime_events for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

-- 5. runtime_contexts — shared execution context snapshots
create table if not exists public.runtime_contexts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  session_id      uuid references public.runtime_sessions (id) on delete cascade,
  context_type    text not null check (context_type in ('workspace','user','workflow','business','agent','session','runtime')),
  context_key     text not null,                       -- unique key within the context_type
  parent_context_id uuid references public.runtime_contexts (id) on delete cascade,
  data            jsonb not null default '{}',         -- the actual context data
  variables       jsonb not null default '{}',         -- runtime variables
  is_shared      boolean not null default true,
  expires_at     timestamptz,                         -- optional TTL
  version        integer not null default 1,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.runtime_contexts enable row level security;
create index if not exists rt_ctx_ws_idx on public.runtime_contexts (workspace_id, context_type);
create index if not exists rt_ctx_session_idx on public.runtime_contexts (session_id);
create index if not exists rt_ctx_key_idx on public.runtime_contexts (workspace_id, context_type, context_key);
create index if not exists rt_ctx_parent_idx on public.runtime_contexts (parent_context_id);
drop policy if exists "rt_ctx_ws" on public.runtime_contexts;
create policy "rt_ctx_ws" on public.runtime_contexts for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_ctx_ws_w" on public.runtime_contexts;
create policy "rt_ctx_ws_w" on public.runtime_contexts for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_ctx_ws_u" on public.runtime_contexts;
create policy "rt_ctx_ws_u" on public.runtime_contexts for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_ctx_ws_d" on public.runtime_contexts;
create policy "rt_ctx_ws_d" on public.runtime_contexts for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- 6. runtime_metrics — per-session resource usage metrics
create table if not exists public.runtime_metrics (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  session_id      uuid references public.runtime_sessions (id) on delete cascade,
  metric_date     date not null,
  total_tasks     integer not null default 0,
  completed_tasks integer not null default 0,
  failed_tasks    integer not null default 0,
  active_processes integer not null default 0,
  peak_concurrent  integer not null default 0,
  total_tokens    bigint not null default 0,
  total_credits   integer not null default 0,
  avg_task_duration_ms integer not null default 0,
  p99_task_duration_ms integer not null default 0,
  total_api_calls integer not null default 0,
  provider_errors integer not null default 0,
  queue_depth_avg integer not null default 0,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (session_id, metric_date)
);
alter table public.runtime_metrics enable row level security;
create index if not exists rt_metrics_ws_date_idx on public.runtime_metrics (workspace_id, metric_date desc);
create index if not exists rt_metrics_session_idx on public.runtime_metrics (session_id, metric_date desc);
drop policy if exists "rt_metrics_ws" on public.runtime_metrics;
create policy "rt_metrics_ws" on public.runtime_metrics for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_metrics_ws_w" on public.runtime_metrics;
create policy "rt_metrics_ws_w" on public.runtime_metrics for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_metrics_ws_u" on public.runtime_metrics;
create policy "rt_metrics_ws_u" on public.runtime_metrics for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- 7. runtime_logs — structured runtime logs
create table if not exists public.runtime_logs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  session_id      uuid references public.runtime_sessions (id) on delete cascade,
  process_id      uuid references public.runtime_processes (id) on delete cascade,
  task_id         uuid references public.runtime_tasks (id) on delete cascade,
  level           text not null check (level in ('debug','info','warn','error','fatal')),
  source          text not null,                       -- 'runtime' | 'orchestrator' | 'scheduler' | 'task-engine' | etc.
  message         text not null,
  details         jsonb not null default '{}',
  request_id      text,
  duration_ms     integer,
  created_at      timestamptz not null default now()
);
alter table public.runtime_logs enable row level security;
create index if not exists rt_logs_ws_idx on public.runtime_logs (workspace_id, created_at desc);
create index if not exists rt_logs_session_idx on public.runtime_logs (session_id, created_at desc);
create index if not exists rt_logs_level_idx on public.runtime_logs (workspace_id, level, created_at desc);
create index if not exists rt_logs_source_idx on public.runtime_logs (source, created_at desc);
drop policy if exists "rt_logs_ws" on public.runtime_logs;
create policy "rt_logs_ws" on public.runtime_logs for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_logs_ws_w" on public.runtime_logs;
create policy "rt_logs_ws_w" on public.runtime_logs for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_logs_ws_d" on public.runtime_logs;
create policy "rt_logs_ws_d" on public.runtime_logs for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- 8. runtime_resources — resource allocation + limits per workspace
create table if not exists public.runtime_resources (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  resource_type   text not null check (resource_type in ('cpu','memory','tokens','credits','concurrent','rate_limit','provider_quota')),
  resource_key    text not null,                       -- e.g. 'openai' | 'anthropic' | 'max_concurrent' | 'token_budget'
  limit_value     integer not null default 0,          -- max allowed
  used_value      integer not null default 0,          -- currently used
  reserved_value  integer not null default 0,           -- reserved for in-flight tasks
  unit            text not null default 'count',       -- 'count' | 'tokens' | 'credits' | 'ms' | 'mb'
  reset_at        timestamptz,                         -- for rate-limited resources
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, resource_type, resource_key)
);
alter table public.runtime_resources enable row level security;
create index if not exists rt_resources_ws_idx on public.runtime_resources (workspace_id, resource_type);
create index if not exists rt_resources_key_idx on public.runtime_resources (workspace_id, resource_type, resource_key);
drop policy if exists "rt_resources_ws" on public.runtime_resources;
create policy "rt_resources_ws" on public.runtime_resources for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_resources_ws_w" on public.runtime_resources;
create policy "rt_resources_ws_w" on public.runtime_resources for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_resources_ws_u" on public.runtime_resources;
create policy "rt_resources_ws_u" on public.runtime_resources for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_resources_ws_d" on public.runtime_resources;
create policy "rt_resources_ws_d" on public.runtime_resources for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- 9. runtime_schedules — scheduled + recurring execution configs
create table if not exists public.runtime_schedules (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  name            text not null,
  description     text,
  schedule_type   text not null check (schedule_type in ('immediate','delayed','scheduled','recurring','event_triggered','manual')),
  cron_expression text,                                -- for recurring (e.g. '0 9 * * 1-5')
  delay_ms        integer,                             -- for delayed
  scheduled_for   timestamptz,                         -- for scheduled
  event_trigger   text,                                -- for event_triggered (event type to listen for)
  target_type     text not null check (target_type in ('agent','workflow','task','process')),
  target_id       uuid not null,                       -- FK to the target entity
  target_config   jsonb not null default '{}',         -- execution config for the target
  status          text not null default 'active' check (status in ('active','paused','completed','failed','cancelled')),
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  run_count       integer not null default 0,
  max_runs        integer,                             -- null = unlimited
  created_by      uuid not null references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.runtime_schedules enable row level security;
create index if not exists rt_sched_ws_idx on public.runtime_schedules (workspace_id, status);
create index if not exists rt_sched_next_run_idx on public.runtime_schedules (next_run_at) where status = 'active';
create index if not exists rt_sched_target_idx on public.runtime_schedules (target_type, target_id);
drop policy if exists "rt_sched_ws" on public.runtime_schedules;
create policy "rt_sched_ws" on public.runtime_schedules for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_sched_ws_w" on public.runtime_schedules;
create policy "rt_sched_ws_w" on public.runtime_schedules for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()) and created_by = auth.uid());
drop policy if exists "rt_sched_ws_u" on public.runtime_schedules;
create policy "rt_sched_ws_u" on public.runtime_schedules for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_sched_ws_d" on public.runtime_schedules;
create policy "rt_sched_ws_d" on public.runtime_schedules for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- 10. runtime_recovery — crash recovery + checkpoint records
create table if not exists public.runtime_recovery (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  session_id      uuid references public.runtime_sessions (id) on delete set null,
  recovery_type   text not null check (recovery_type in ('crash','restart','checkpoint','restore','failover')),
  status          text not null default 'pending' check (status in ('pending','in_progress','completed','failed','abandoned')),
  checkpoint_data jsonb not null default '{}',         -- snapshot of session state
  failed_processes jsonb not null default '[]',        -- array of process IDs that failed
  recovered_processes jsonb not null default '[]',     -- array of process IDs that were recovered
  error           text,
  started_at      timestamptz,
  completed_at    timestamptz,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.runtime_recovery enable row level security;
create index if not exists rt_recovery_ws_idx on public.runtime_recovery (workspace_id, created_at desc);
create index if not exists rt_recovery_session_idx on public.runtime_recovery (session_id);
create index if not exists rt_recovery_status_idx on public.runtime_recovery (workspace_id, status);
drop policy if exists "rt_recovery_ws" on public.runtime_recovery;
create policy "rt_recovery_ws" on public.runtime_recovery for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_recovery_ws_w" on public.runtime_recovery;
create policy "rt_recovery_ws_w" on public.runtime_recovery for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "rt_recovery_ws_u" on public.runtime_recovery;
create policy "rt_recovery_ws_u" on public.runtime_recovery for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- Attach updated_at triggers to all Phase 12 mutable tables
do $$ declare t text; begin
  foreach t in array array[
    'runtime_sessions','runtime_processes','runtime_tasks','runtime_events',
    'runtime_contexts','runtime_metrics','runtime_logs','runtime_resources',
    'runtime_schedules','runtime_recovery'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();', t);
  end loop;
end; $$;

-- =============================================================================
-- END 0018_phase12_supa_os_runtime.sql
-- =============================================================================
