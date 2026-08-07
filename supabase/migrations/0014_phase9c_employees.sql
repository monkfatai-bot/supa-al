-- =============================================================================
-- SUPA AI — 0014_phase9c_employees.sql
-- Phase 9C: AI Employees Platform — hire, train, collaborate, manage AI workers.
--
-- 10 tables, workspace-scoped with default-deny RLS.
-- =============================================================================

-- 1. ai_employees
create table if not exists public.ai_employees (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.workspaces (id) on delete cascade,
  name          text not null,
  avatar_url    text,
  role          text not null,               -- 'Marketing Specialist' | 'Sales Rep' | etc.
  department    text not null default 'general',
  description   text,
  status        text not null default 'active' check (status in ('active','paused','archived','training','busy')),
  experience_level text not null default 'mid' check (experience_level in ('junior','mid','senior','expert')),
  system_prompt text,                        -- the employee's personality/instructions
  permissions   jsonb not null default '[]', -- ['ai.chat','ai.image','crm.write', ...]
  tools         jsonb not null default '[]', -- ['email','calendar','crm', ...]
  is_template   boolean not null default false,
  is_public     boolean not null default false,
  version       integer not null default 1,
  metadata      jsonb,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.ai_employees enable row level security;
create index if not exists ai_employees_workspace_idx on public.ai_employees (workspace_id, created_at desc);
create index if not exists ai_employees_status_idx on public.ai_employees (workspace_id, status);
create index if not exists ai_employees_dept_idx on public.ai_employees (workspace_id, department);
create index if not exists ai_employees_name_fts_idx on public.ai_employees using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(role,'') || ' ' || coalesce(description,'')));
create index if not exists ai_employees_public_idx on public.ai_employees (is_public, is_template) where is_public = true;
drop policy if exists "ai_employees_ws_or_public" on public.ai_employees;
create policy "ai_employees_ws_or_public" on public.ai_employees for select
  using (is_public = true or (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid())));
drop policy if exists "ai_employees_ws_write" on public.ai_employees;
create policy "ai_employees_ws_write" on public.ai_employees for insert
  with check (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()) and created_by = auth.uid());
drop policy if exists "ai_employees_ws_update" on public.ai_employees;
create policy "ai_employees_ws_update" on public.ai_employees for update
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "ai_employees_ws_delete" on public.ai_employees;
create policy "ai_employees_ws_delete" on public.ai_employees for delete
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

-- 2. employee_skills
create table if not exists public.employee_skills (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.ai_employees (id) on delete cascade,
  skill_name    text not null,               -- 'content-writing' | 'coding' | 'translation' | etc.
  proficiency   integer not null default 50 check (proficiency >= 0 and proficiency <= 100),
  is_primary    boolean not null default false,
  config        jsonb not null default '{}', -- skill-specific configuration
  created_at    timestamptz not null default now(),
  unique (employee_id, skill_name)
);
alter table public.employee_skills enable row level security;
create index if not exists employee_skills_employee_idx on public.employee_skills (employee_id);
create index if not exists employee_skills_skill_idx on public.employee_skills (skill_name);
drop policy if exists "employee_skills_ws" on public.employee_skills;
create policy "employee_skills_ws" on public.employee_skills for select using (
  exists (select 1 from public.ai_employees e where e.id = employee_skills.employee_id and (e.is_public = true or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))))
);
drop policy if exists "employee_skills_ws_write" on public.employee_skills;
create policy "employee_skills_ws_write" on public.employee_skills for insert with check (
  exists (select 1 from public.ai_employees e where e.id = employee_skills.employee_id and e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))
);
drop policy if exists "employee_skills_ws_update" on public.employee_skills;
create policy "employee_skills_ws_update" on public.employee_skills for update using (
  exists (select 1 from public.ai_employees e where e.id = employee_skills.employee_id and e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))
);
drop policy if exists "employee_skills_ws_delete" on public.employee_skills;
create policy "employee_skills_ws_delete" on public.employee_skills for delete using (
  exists (select 1 from public.ai_employees e where e.id = employee_skills.employee_id and e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))
);

-- 3. employee_memory
create table if not exists public.employee_memory (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.ai_employees (id) on delete cascade,
  workspace_id  uuid references public.workspaces (id) on delete cascade,
  memory_type   text not null check (memory_type in ('long-term','session','workspace','user-preference','task-history','knowledge-ref','learning')),
  key           text not null,
  value         jsonb not null,
  importance    integer not null default 50 check (importance >= 0 and importance <= 100),
  expires_at    timestamptz,
  metadata      jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.employee_memory enable row level security;
create index if not exists employee_memory_employee_idx on public.employee_memory (employee_id, memory_type, created_at desc);
create index if not exists employee_memory_workspace_idx on public.employee_memory (workspace_id) where workspace_id is not null;
drop policy if exists "employee_memory_ws" on public.employee_memory;
create policy "employee_memory_ws" on public.employee_memory for select using (
  exists (select 1 from public.ai_employees e where e.id = employee_memory.employee_id and e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))
);
drop policy if exists "employee_memory_ws_write" on public.employee_memory;
create policy "employee_memory_ws_write" on public.employee_memory for insert with check (
  exists (select 1 from public.ai_employees e where e.id = employee_memory.employee_id and e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))
);
drop policy if exists "employee_memory_ws_update" on public.employee_memory;
create policy "employee_memory_ws_update" on public.employee_memory for update using (
  exists (select 1 from public.ai_employees e where e.id = employee_memory.employee_id and e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))
);
drop policy if exists "employee_memory_ws_delete" on public.employee_memory;
create policy "employee_memory_ws_delete" on public.employee_memory for delete using (
  exists (select 1 from public.ai_employees e where e.id = employee_memory.employee_id and e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))
);

-- 4. employee_training
create table if not exists public.employee_training (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.ai_employees (id) on delete cascade,
  workspace_id  uuid references public.workspaces (id) on delete cascade,
  source_type   text not null check (source_type in ('document','pdf','docx','txt','markdown','csv','json','website','knowledge-base','conversation')),
  source_id     uuid,                        -- FK to the source (document, file, etc.)
  source_url    text,                        -- for websites
  title         text not null,
  content_hash  text,                        -- dedup key
  status        text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  chunk_count   integer not null default 0,
  error_message text,
  trained_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.employee_training enable row level security;
create index if not exists employee_training_employee_idx on public.employee_training (employee_id, created_at desc);
create index if not exists employee_training_status_idx on public.employee_training (status);
drop policy if exists "employee_training_ws" on public.employee_training;
create policy "employee_training_ws" on public.employee_training for select using (
  exists (select 1 from public.ai_employees e where e.id = employee_training.employee_id and e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))
);
drop policy if exists "employee_training_ws_write" on public.employee_training;
create policy "employee_training_ws_write" on public.employee_training for insert with check (
  exists (select 1 from public.ai_employees e where e.id = employee_training.employee_id and e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))
);
drop policy if exists "employee_training_ws_delete" on public.employee_training;
create policy "employee_training_ws_delete" on public.employee_training for delete using (
  exists (select 1 from public.ai_employees e where e.id = employee_training.employee_id and e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))
);

-- 5. employee_departments
create table if not exists public.employee_departments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.workspaces (id) on delete cascade,
  name          text not null,
  label         text not null,
  description   text,
  icon          text,
  color         text,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, name)
);
alter table public.employee_departments enable row level security;
create index if not exists employee_departments_workspace_idx on public.employee_departments (workspace_id, sort_order);
drop policy if exists "employee_departments_ws" on public.employee_departments;
create policy "employee_departments_ws" on public.employee_departments for select using (
  workspace_id is null or public.is_workspace_member(workspace_id, auth.uid())
);
drop policy if exists "employee_departments_ws_write" on public.employee_departments;
create policy "employee_departments_ws_write" on public.employee_departments for insert with check (
  workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid())
);
drop policy if exists "employee_departments_ws_update" on public.employee_departments;
create policy "employee_departments_ws_update" on public.employee_departments for update using (
  workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid())
);
drop policy if exists "employee_departments_ws_delete" on public.employee_departments;
create policy "employee_departments_ws_delete" on public.employee_departments for delete using (
  workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid())
);

-- 6. employee_assignments (employee ↔ workspace assignments)
create table if not exists public.employee_assignments (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.ai_employees (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  assigned_by   uuid references auth.users (id) on delete set null,
  role_override text,                        -- override the employee's default role for this workspace
  status        text not null default 'active' check (status in ('active','paused','removed')),
  assigned_at   timestamptz not null default now(),
  unique (employee_id, workspace_id)
);
alter table public.employee_assignments enable row level security;
create index if not exists employee_assignments_employee_idx on public.employee_assignments (employee_id);
create index if not exists employee_assignments_workspace_idx on public.employee_assignments (workspace_id);
drop policy if exists "employee_assignments_ws" on public.employee_assignments;
create policy "employee_assignments_ws" on public.employee_assignments for select using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "employee_assignments_ws_write" on public.employee_assignments;
create policy "employee_assignments_ws_write" on public.employee_assignments for insert with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "employee_assignments_ws_update" on public.employee_assignments;
create policy "employee_assignments_ws_update" on public.employee_assignments for update using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "employee_assignments_ws_delete" on public.employee_assignments;
create policy "employee_assignments_ws_delete" on public.employee_assignments for delete using (public.is_workspace_member(workspace_id, auth.uid()));

-- 7. employee_performance
create table if not exists public.employee_performance (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.ai_employees (id) on delete cascade,
  workspace_id  uuid references public.workspaces (id) on delete cascade,
  metric_date   date not null default current_date,
  tasks_completed integer not null default 0,
  tasks_failed  integer not null default 0,
  success_rate  real not null default 0,
  avg_response_ms integer,
  credits_consumed integer not null default 0,
  cost_cents    integer not null default 0,
  total_tokens  integer not null default 0,
  workflow_participations integer not null default 0,
  user_rating   real,
  error_count   integer not null default 0,
  metadata      jsonb,
  created_at    timestamptz not null default now(),
  unique (employee_id, metric_date)
);
alter table public.employee_performance enable row level security;
create index if not exists employee_performance_employee_idx on public.employee_performance (employee_id, metric_date desc);
create index if not exists employee_performance_workspace_idx on public.employee_performance (workspace_id, metric_date desc);
drop policy if exists "employee_performance_ws" on public.employee_performance;
create policy "employee_performance_ws" on public.employee_performance for select using (
  exists (select 1 from public.ai_employees e where e.id = employee_performance.employee_id and (e.is_public = true or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))))
);
-- Inserts are service-role only (the engine records performance with the admin client).

-- 8. employee_messages (inter-employee collaboration)
create table if not exists public.employee_messages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  from_employee_id uuid not null references public.ai_employees (id) on delete cascade,
  to_employee_id   uuid not null references public.ai_employees (id) on delete cascade,
  message_type  text not null default 'message' check (message_type in ('message','task-delegation','escalation','handoff','context-share')),
  content       text not null,
  context       jsonb,                       -- shared context data
  status        text not null default 'sent' check (status in ('sent','delivered','read','actioned')),
  parent_id     uuid references public.employee_messages (id) on delete cascade,
  created_at    timestamptz not null default now()
);
alter table public.employee_messages enable row level security;
create index if not exists employee_messages_workspace_idx on public.employee_messages (workspace_id, created_at desc);
create index if not exists employee_messages_from_idx on public.employee_messages (from_employee_id);
create index if not exists employee_messages_to_idx on public.employee_messages (to_employee_id, status);
drop policy if exists "employee_messages_ws" on public.employee_messages;
create policy "employee_messages_ws" on public.employee_messages for select using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "employee_messages_ws_write" on public.employee_messages;
create policy "employee_messages_ws_write" on public.employee_messages for insert with check (public.is_workspace_member(workspace_id, auth.uid()));

-- 9. employee_marketplace
create table if not exists public.employee_marketplace (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.ai_employees (id) on delete cascade,
  title         text not null,
  description   text not null,
  category      text not null,
  tags          text[] not null default '{}',
  icon          text,
  featured      boolean not null default false,
  install_count integer not null default 0,
  rating        real not null default 0,
  review_count  integer not null default 0,
  version       text not null default '1.0.0',
  is_published  boolean not null default true,
  published_by  uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.employee_marketplace enable row level security;
create index if not exists employee_marketplace_category_idx on public.employee_marketplace (category, is_published);
create index if not exists employee_marketplace_featured_idx on public.employee_marketplace (featured, rating desc) where is_published = true;
create index if not exists employee_marketplace_title_fts_idx on public.employee_marketplace using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'')));
drop policy if exists "employee_marketplace_public" on public.employee_marketplace;
create policy "employee_marketplace_public" on public.employee_marketplace for select using (is_published = true);
drop policy if exists "employee_marketplace_write" on public.employee_marketplace;
create policy "employee_marketplace_write" on public.employee_marketplace for insert with check (published_by = auth.uid());
drop policy if exists "employee_marketplace_update_owner" on public.employee_marketplace;
create policy "employee_marketplace_update_owner" on public.employee_marketplace for update using (published_by = auth.uid());
drop policy if exists "employee_marketplace_delete_owner" on public.employee_marketplace;
create policy "employee_marketplace_delete_owner" on public.employee_marketplace for delete using (published_by = auth.uid());

-- 10. employee_versions
create table if not exists public.employee_versions (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.ai_employees (id) on delete cascade,
  version_number integer not null,
  snapshot      jsonb not null,              -- full employee config snapshot
  changelog     text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (employee_id, version_number)
);
alter table public.employee_versions enable row level security;
create index if not exists employee_versions_employee_idx on public.employee_versions (employee_id, version_number desc);
drop policy if exists "employee_versions_ws" on public.employee_versions;
create policy "employee_versions_ws" on public.employee_versions for select using (
  exists (select 1 from public.ai_employees e where e.id = employee_versions.employee_id and (e.is_public = true or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))))
);
drop policy if exists "employee_versions_ws_write" on public.employee_versions;
create policy "employee_versions_ws_write" on public.employee_versions for insert with check (
  exists (select 1 from public.ai_employees e where e.id = employee_versions.employee_id and e.workspace_id is not null and public.is_workspace_member(e.workspace_id, auth.uid()))
);

-- Updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['ai_employees','employee_memory','employee_training','employee_departments','employee_marketplace'] loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();', t);
  end loop;
end;
$$;

-- Enable Realtime for collaboration
alter publication supabase_realtime add table public.employee_messages;

-- Seed departments
insert into public.employee_departments (workspace_id, name, label, description, icon, sort_order)
values
  (null, 'marketing', 'Marketing', 'Marketing specialists, content creators, and campaign managers.', 'Megaphone', 1),
  (null, 'sales', 'Sales', 'Sales representatives, lead qualifiers, and account managers.', 'TrendingUp', 2),
  (null, 'customer-support', 'Customer Support', 'Support agents, ticket routers, and satisfaction trackers.', 'Headphones', 3),
  (null, 'hr', 'Human Resources', 'HR specialists, recruiters, and onboarding coordinators.', 'Users', 4),
  (null, 'finance', 'Finance', 'Financial analysts, accountants, and expense managers.', 'DollarSign', 5),
  (null, 'legal', 'Legal', 'Legal advisors, contract drafters, and compliance officers.', 'Scale', 6),
  (null, 'operations', 'Operations', 'Operations managers, project coordinators, and process optimizers.', 'Settings', 7),
  (null, 'content', 'Content', 'Content writers, editors, and SEO specialists.', 'FileText', 8),
  (null, 'research', 'Research', 'Research analysts, data scientists, and report writers.', 'Search', 9),
  (null, 'coding', 'Engineering', 'Software engineers, code reviewers, and technical architects.', 'Code', 10),
  (null, 'design', 'Design', 'UI/UX designers, brand specialists, and creative directors.', 'Palette', 11),
  (null, 'product', 'Product', 'Product managers, roadmap planners, and feature specifiers.', 'Package', 12),
  (null, 'data-analysis', 'Data Analysis', 'Data analysts, BI specialists, and visualization experts.', 'BarChart3', 13),
  (null, 'education', 'Education', 'Course creators, tutors, and curriculum designers.', 'GraduationCap', 14),
  (null, 'ecommerce', 'E-commerce', 'Store managers, inventory trackers, and order processors.', 'ShoppingCart', 15)
on conflict (workspace_id, name) do update set
  label = excluded.label,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;
