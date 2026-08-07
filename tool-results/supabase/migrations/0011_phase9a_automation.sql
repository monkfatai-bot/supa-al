-- =============================================================================
-- SUPA AI — 0011_phase9a_automation.sql
-- Phase 9A: Automation Engine — workflows, triggers, actions, runs, logs,
-- variables, scheduled jobs, templates, and webhook endpoints.
--
-- 9 tables, workspace-scoped with default-deny RLS. The shared
-- `public.is_workspace_member(ws_id, user_id)` SECURITY DEFINER function
-- (created in 0009_phase7_workspace.sql) backs every workspace policy.
-- The shared `public.set_updated_at()` trigger (from 0003_indexes.sql)
-- maintains `updated_at` on every table that has one.
--
-- Design principles (carried from 0001 / 0009 / 0014):
--   • Idempotent — every statement is safe to re-run.
--   • RLS on every new table. Default-deny. No `USING (true)` open policies.
--   • Money is integer cents (n/a here). Timestamps are timestamptz.
--   • updated_at maintained by the shared set_updated_at() trigger.
-- =============================================================================

-- =============================================================================
-- 1. workflows
-- =============================================================================
create table if not exists public.workflows (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  name               text not null,
  description       text,
  status             text not null default 'draft'
                       check (status in ('active','paused','archived','draft')),
  version            integer not null default 1,
  is_template       boolean not null default false,
  template_category text,
  config             jsonb not null default '{}',
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.workflows enable row level security;

create index if not exists workflows_workspace_idx
  on public.workflows (workspace_id, created_at desc);
create index if not exists workflows_status_idx
  on public.workflows (workspace_id, status);
create index if not exists workflows_template_idx
  on public.workflows (is_template, template_category) where is_template = true;
create index if not exists workflows_name_fts_idx
  on public.workflows using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));

drop policy if exists "workflows_select_member" on public.workflows;
create policy "workflows_select_member" on public.workflows for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflows_insert_member" on public.workflows;
create policy "workflows_insert_member" on public.workflows for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()) and created_by = auth.uid());

drop policy if exists "workflows_update_member" on public.workflows;
create policy "workflows_update_member" on public.workflows for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflows_delete_member" on public.workflows;
create policy "workflows_delete_member" on public.workflows for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 2. workflow_triggers
-- =============================================================================
create table if not exists public.workflow_triggers (
  id            uuid primary key default gen_random_uuid(),
  workflow_id   uuid not null references public.workflows (id) on delete cascade,
  type          text not null check (type in ('schedule','event','webhook','manual','api')),
  config        jsonb not null default '{}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.workflow_triggers enable row level security;

create index if not exists workflow_triggers_workflow_idx
  on public.workflow_triggers (workflow_id);
create index if not exists workflow_triggers_active_idx
  on public.workflow_triggers (is_active) where is_active = true;

drop policy if exists "workflow_triggers_select_member" on public.workflow_triggers;
create policy "workflow_triggers_select_member" on public.workflow_triggers for select
  using (
    exists (select 1 from public.workflows w
            where w.id = workflow_triggers.workflow_id
              and public.is_workspace_member(w.workspace_id, auth.uid()))
  );

drop policy if exists "workflow_triggers_insert_member" on public.workflow_triggers;
create policy "workflow_triggers_insert_member" on public.workflow_triggers for insert
  with check (
    exists (select 1 from public.workflows w
            where w.id = workflow_triggers.workflow_id
              and public.is_workspace_member(w.workspace_id, auth.uid()))
  );

drop policy if exists "workflow_triggers_update_member" on public.workflow_triggers;
create policy "workflow_triggers_update_member" on public.workflow_triggers for update
  using (
    exists (select 1 from public.workflows w
            where w.id = workflow_triggers.workflow_id
              and public.is_workspace_member(w.workspace_id, auth.uid()))
  );

drop policy if exists "workflow_triggers_delete_member" on public.workflow_triggers;
create policy "workflow_triggers_delete_member" on public.workflow_triggers for delete
  using (
    exists (select 1 from public.workflows w
            where w.id = workflow_triggers.workflow_id
              and public.is_workspace_member(w.workspace_id, auth.uid()))
  );

-- =============================================================================
-- 3. workflow_actions
-- =============================================================================
create table if not exists public.workflow_actions (
  id            uuid primary key default gen_random_uuid(),
  workflow_id   uuid not null references public.workflows (id) on delete cascade,
  type          text not null,
  name          text not null,
  config        jsonb not null default '{}',
  "order"       integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.workflow_actions enable row level security;

create index if not exists workflow_actions_workflow_idx
  on public.workflow_actions (workflow_id, "order");

drop policy if exists "workflow_actions_select_member" on public.workflow_actions;
create policy "workflow_actions_select_member" on public.workflow_actions for select
  using (
    exists (select 1 from public.workflows w
            where w.id = workflow_actions.workflow_id
              and public.is_workspace_member(w.workspace_id, auth.uid()))
  );

drop policy if exists "workflow_actions_insert_member" on public.workflow_actions;
create policy "workflow_actions_insert_member" on public.workflow_actions for insert
  with check (
    exists (select 1 from public.workflows w
            where w.id = workflow_actions.workflow_id
              and public.is_workspace_member(w.workspace_id, auth.uid()))
  );

drop policy if exists "workflow_actions_update_member" on public.workflow_actions;
create policy "workflow_actions_update_member" on public.workflow_actions for update
  using (
    exists (select 1 from public.workflows w
            where w.id = workflow_actions.workflow_id
              and public.is_workspace_member(w.workspace_id, auth.uid()))
  );

drop policy if exists "workflow_actions_delete_member" on public.workflow_actions;
create policy "workflow_actions_delete_member" on public.workflow_actions for delete
  using (
    exists (select 1 from public.workflows w
            where w.id = workflow_actions.workflow_id
              and public.is_workspace_member(w.workspace_id, auth.uid()))
  );

-- =============================================================================
-- 4. workflow_runs
-- =============================================================================
create table if not exists public.workflow_runs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  workflow_id   uuid not null references public.workflows (id) on delete cascade,
  trigger_id    uuid references public.workflow_triggers (id) on delete set null,
  status        text not null default 'pending'
                  check (status in ('pending','running','completed','failed','cancelled')),
  started_at    timestamptz,
  completed_at  timestamptz,
  error         text,
  result        jsonb,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.workflow_runs enable row level security;

create index if not exists workflow_runs_workspace_idx
  on public.workflow_runs (workspace_id, created_at desc);
create index if not exists workflow_runs_workflow_idx
  on public.workflow_runs (workflow_id, created_at desc);
create index if not exists workflow_runs_status_idx
  on public.workflow_runs (status, created_at desc);

drop policy if exists "workflow_runs_select_member" on public.workflow_runs;
create policy "workflow_runs_select_member" on public.workflow_runs for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_runs_insert_member" on public.workflow_runs;
create policy "workflow_runs_insert_member" on public.workflow_runs for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_runs_update_member" on public.workflow_runs;
create policy "workflow_runs_update_member" on public.workflow_runs for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_runs_delete_member" on public.workflow_runs;
create policy "workflow_runs_delete_member" on public.workflow_runs for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 5. workflow_logs
-- =============================================================================
create table if not exists public.workflow_logs (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.workflow_runs (id) on delete cascade,
  level         text not null default 'info'
                  check (level in ('debug','info','warn','error')),
  message       text not null,
  details       jsonb,
  created_at    timestamptz not null default now()
);

alter table public.workflow_logs enable row level security;

create index if not exists workflow_logs_run_idx
  on public.workflow_logs (run_id, created_at desc);

drop policy if exists "workflow_logs_select_member" on public.workflow_logs;
create policy "workflow_logs_select_member" on public.workflow_logs for select
  using (
    exists (select 1 from public.workflow_runs r
            where r.id = workflow_logs.run_id
              and public.is_workspace_member(r.workspace_id, auth.uid()))
  );

drop policy if exists "workflow_logs_insert_member" on public.workflow_logs;
create policy "workflow_logs_insert_member" on public.workflow_logs for insert
  with check (
    exists (select 1 from public.workflow_runs r
            where r.id = workflow_logs.run_id
              and public.is_workspace_member(r.workspace_id, auth.uid()))
  );

drop policy if exists "workflow_logs_delete_member" on public.workflow_logs;
create policy "workflow_logs_delete_member" on public.workflow_logs for delete
  using (
    exists (select 1 from public.workflow_runs r
            where r.id = workflow_logs.run_id
              and public.is_workspace_member(r.workspace_id, auth.uid()))
  );

-- =============================================================================
-- 6. workflow_variables
-- =============================================================================
create table if not exists public.workflow_variables (
  id            uuid primary key default gen_random_uuid(),
  workflow_id   uuid not null references public.workflows (id) on delete cascade,
  key           text not null,
  value         text,
  type          text not null default 'string'
                  check (type in ('string','number','boolean','json','secret')),
  is_secret     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workflow_id, key)
);

alter table public.workflow_variables enable row level security;

create index if not exists workflow_variables_workflow_idx
  on public.workflow_variables (workflow_id);

drop policy if exists "workflow_variables_select_member" on public.workflow_variables;
create policy "workflow_variables_select_member" on public.workflow_variables for select
  using (
    exists (select 1 from public.workflows w
            where w.id = workflow_variables.workflow_id
              and public.is_workspace_member(w.workspace_id, auth.uid()))
  );

drop policy if exists "workflow_variables_insert_member" on public.workflow_variables;
create policy "workflow_variables_insert_member" on public.workflow_variables for insert
  with check (
    exists (select 1 from public.workflows w
            where w.id = workflow_variables.workflow_id
              and public.is_workspace_member(w.workspace_id, auth.uid()))
  );

drop policy if exists "workflow_variables_update_member" on public.workflow_variables;
create policy "workflow_variables_update_member" on public.workflow_variables for update
  using (
    exists (select 1 from public.workflows w
            where w.id = workflow_variables.workflow_id
              and public.is_workspace_member(w.workspace_id, auth.uid()))
  );

drop policy if exists "workflow_variables_delete_member" on public.workflow_variables;
create policy "workflow_variables_delete_member" on public.workflow_variables for delete
  using (
    exists (select 1 from public.workflows w
            where w.id = workflow_variables.workflow_id
              and public.is_workspace_member(w.workspace_id, auth.uid()))
  );

-- =============================================================================
-- 7. scheduled_jobs
-- =============================================================================
create table if not exists public.scheduled_jobs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  workflow_id   uuid not null references public.workflows (id) on delete cascade,
  trigger_id    uuid not null references public.workflow_triggers (id) on delete cascade,
  next_run_at   timestamptz not null,
  last_run_at    timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.scheduled_jobs enable row level security;

create index if not exists scheduled_jobs_due_idx
  on public.scheduled_jobs (next_run_at) where is_active = true;
create index if not exists scheduled_jobs_workspace_idx
  on public.scheduled_jobs (workspace_id);
create index if not exists scheduled_jobs_workflow_idx
  on public.scheduled_jobs (workflow_id);

drop policy if exists "scheduled_jobs_select_member" on public.scheduled_jobs;
create policy "scheduled_jobs_select_member" on public.scheduled_jobs for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "scheduled_jobs_insert_member" on public.scheduled_jobs;
create policy "scheduled_jobs_insert_member" on public.scheduled_jobs for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "scheduled_jobs_update_member" on public.scheduled_jobs;
create policy "scheduled_jobs_update_member" on public.scheduled_jobs for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "scheduled_jobs_delete_member" on public.scheduled_jobs;
create policy "scheduled_jobs_delete_member" on public.scheduled_jobs for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 8. automation_templates
-- =============================================================================
create table if not exists public.automation_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  category      text not null default 'general',
  config        jsonb not null default '{}',
  is_featured   boolean not null default false,
  install_count integer not null default 0,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.automation_templates enable row level security;

create index if not exists automation_templates_category_idx
  on public.automation_templates (category, is_featured);
create index if not exists automation_templates_featured_idx
  on public.automation_templates (is_featured, install_count desc) where is_featured = true;
create index if not exists automation_templates_name_fts_idx
  on public.automation_templates using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));

-- Public read — templates are browsable by every authenticated user.
drop policy if exists "automation_templates_select_auth" on public.automation_templates;
create policy "automation_templates_select_auth" on public.automation_templates for select
  using (auth.uid() is not null);

drop policy if exists "automation_templates_insert_creator" on public.automation_templates;
create policy "automation_templates_insert_creator" on public.automation_templates for insert
  with check (created_by = auth.uid());

drop policy if exists "automation_templates_update_creator" on public.automation_templates;
create policy "automation_templates_update_creator" on public.automation_templates for update
  using (created_by = auth.uid());

drop policy if exists "automation_templates_delete_creator" on public.automation_templates;
create policy "automation_templates_delete_creator" on public.automation_templates for delete
  using (created_by = auth.uid());

-- =============================================================================
-- 9. webhook_endpoints
-- =============================================================================
create table if not exists public.webhook_endpoints (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  workflow_id   uuid not null references public.workflows (id) on delete cascade,
  url_slug      text not null,
  is_active     boolean not null default true,
  secret        text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (url_slug)
);

alter table public.webhook_endpoints enable row level security;

create index if not exists webhook_endpoints_slug_idx
  on public.webhook_endpoints (url_slug) where is_active = true;
create index if not exists webhook_endpoints_workspace_idx
  on public.webhook_endpoints (workspace_id);
create index if not exists webhook_endpoints_workflow_idx
  on public.webhook_endpoints (workflow_id);

drop policy if exists "webhook_endpoints_select_member" on public.webhook_endpoints;
create policy "webhook_endpoints_select_member" on public.webhook_endpoints for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "webhook_endpoints_insert_member" on public.webhook_endpoints;
create policy "webhook_endpoints_insert_member" on public.webhook_endpoints for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "webhook_endpoints_update_member" on public.webhook_endpoints;
create policy "webhook_endpoints_update_member" on public.webhook_endpoints for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "webhook_endpoints_delete_member" on public.webhook_endpoints;
create policy "webhook_endpoints_delete_member" on public.webhook_endpoints for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- updated_at triggers (shared set_updated_at() from 0003_indexes.sql)
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'workflows',
    'workflow_triggers',
    'workflow_actions',
    'workflow_runs',
    'workflow_variables',
    'scheduled_jobs',
    'automation_templates',
    'webhook_endpoints'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();', t);
  end loop;
end;
$$;

-- =============================================================================
-- Seed featured automation templates (idempotent)
-- =============================================================================
insert into public.automation_templates (name, description, category, config, is_featured)
values
  (
    'Welcome Email',
    'Send a personalized welcome email whenever a new contact is created in your CRM.',
    'marketing',
    jsonb_build_object(
      'trigger', jsonb_build_object('type', 'event', 'event', 'contact.created'),
      'actions', jsonb_build_array(
        jsonb_build_object('type', 'send_email', 'name', 'Send welcome email', 'config', jsonb_build_object('template', 'welcome', 'delayMinutes', 0))
      )
    ),
    true
  ),
  (
    'Daily Standup Digest',
    'Collect open tasks and post a digest to Slack every morning at 9am.',
    'operations',
    jsonb_build_object(
      'trigger', jsonb_build_object('type', 'schedule', 'cron', '0 9 * * *'),
      'actions', jsonb_build_array(
        jsonb_build_object('type', 'http_request', 'name', 'Fetch open tasks', 'config', jsonb_build_object('url', 'https://api.example.com/tasks', 'method', 'GET')),
        jsonb_build_object('type', 'http_request', 'name', 'Post to Slack', 'config', jsonb_build_object('url', 'https://hooks.slack.com/services/...', 'method', 'POST'))
      )
    ),
    true
  ),
  (
    'Lead Routing',
    'When a high-value lead comes in, create a CRM record, notify sales, and schedule a follow-up.',
    'sales',
    jsonb_build_object(
      'trigger', jsonb_build_object('type', 'webhook'),
      'actions', jsonb_build_array(
        jsonb_build_object('type', 'create_record', 'name', 'Create lead', 'config', jsonb_build_object('table', 'leads')),
        jsonb_build_object('type', 'http_request', 'name', 'Notify sales', 'config', jsonb_build_object('url', 'https://hooks.slack.com/services/...', 'method', 'POST'))
      )
    ),
    false
  ),
  (
    'Content Pipeline',
    'When a draft is ready, schedule social posts, generate SEO metadata, and notify the editor.',
    'content',
    jsonb_build_object(
      'trigger', jsonb_build_object('type', 'event', 'event', 'document.published'),
      'actions', jsonb_build_array(
        jsonb_build_object('type', 'http_request', 'name', 'Generate SEO', 'config', jsonb_build_object('url', 'https://api.example.com/seo', 'method', 'POST')),
        jsonb_build_object('type', 'send_email', 'name', 'Notify editor', 'config', jsonb_build_object('template', 'editor-review'))
      )
    ),
    false
  ),
  (
    'Onboarding Sequence',
    'Trigger a 5-day drip email sequence when a user signs up.',
    'marketing',
    jsonb_build_object(
      'trigger', jsonb_build_object('type', 'event', 'event', 'user.signed_up'),
      'actions', jsonb_build_array(
        jsonb_build_object('type', 'send_email', 'name', 'Day 1 - Welcome', 'config', jsonb_build_object('template', 'onboarding-d1', 'delayMinutes', 0)),
        jsonb_build_object('type', 'send_email', 'name', 'Day 3 - Tips', 'config', jsonb_build_object('template', 'onboarding-d3', 'delayMinutes', 4320)),
        jsonb_build_object('type', 'send_email', 'name', 'Day 5 - Resources', 'config', jsonb_build_object('template', 'onboarding-d5', 'delayMinutes', 7200))
      )
    ),
    true
  )
on conflict do nothing;
