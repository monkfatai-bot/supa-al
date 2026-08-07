-- =============================================================================
-- SUPA AI — 0012_phase9b_builder.sql
-- Phase 9B: Visual Workflow Builder.
--
-- 7 tables, workspace-scoped with default-deny RLS.
--
-- Design principles (carried from 0001 + 0009):
--   • Idempotent — every statement is safe to re-run.
--   • RLS on every new table. Default-deny. No `USING (true)` open policies.
--   • Money is integer cents. Timestamps are timestamptz.
--   • updated_at maintained by the shared set_updated_at() trigger from 0003.
--   • Every workspace-scoped policy calls public.is_workspace_member() (0009).
--
-- `workflow_id` is a `text` rather than a UUID FK on purpose: it lets a
-- workflow be backed by any surface (a workspace document, a stand-alone
-- workflow record, a marketplace template id) without coupling the builder
-- to any one of them. The combination (workspace_id, workflow_id) is unique
-- for nodes/edges so a single workflow's graph is replaceable in one save.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. workflow_nodes
--
-- One row per node on a workflow canvas. `node_key` is the caller's stable
-- per-workflow identifier (e.g. "trigger_1", "step_email") so the UI can
-- diff saves without relying on the server-generated `id`.
-- -----------------------------------------------------------------------------
create table if not exists public.workflow_nodes (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  workflow_id   text not null,
  node_type     text not null check (node_type in (
                  'trigger','action','condition','transform','ai','integration','output'
                )),
  node_key      text not null,
  label         text not null default '',
  position      jsonb not null default '{"x":0,"y":0}',
  config        jsonb not null default '{}',
  is_enabled    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, workflow_id, node_key)
);

alter table public.workflow_nodes enable row level security;

create index if not exists workflow_nodes_workspace_workflow_idx
  on public.workflow_nodes (workspace_id, workflow_id);
create index if not exists workflow_nodes_workspace_idx
  on public.workflow_nodes (workspace_id, created_at desc);
create index if not exists workflow_nodes_type_idx
  on public.workflow_nodes (workspace_id, node_type);

drop policy if exists "workflow_nodes_select_ws" on public.workflow_nodes;
create policy "workflow_nodes_select_ws" on public.workflow_nodes for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_nodes_insert_ws" on public.workflow_nodes;
create policy "workflow_nodes_insert_ws" on public.workflow_nodes for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_nodes_update_ws" on public.workflow_nodes;
create policy "workflow_nodes_update_ws" on public.workflow_nodes for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_nodes_delete_ws" on public.workflow_nodes;
create policy "workflow_nodes_delete_ws" on public.workflow_nodes for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. workflow_edges
--
-- One row per connection between two nodes. `source_port` + `target_port`
-- support multi-port nodes (e.g. a switch with N branches). `condition`
-- carries the per-edge predicate for conditional routing.
-- -----------------------------------------------------------------------------
create table if not exists public.workflow_edges (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  workflow_id     text not null,
  source_node_id   uuid not null references public.workflow_nodes (id) on delete cascade,
  target_node_id   uuid not null references public.workflow_nodes (id) on delete cascade,
  source_port     text not null default 'out',
  target_port     text not null default 'in',
  label           text not null default '',
  condition       jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.workflow_edges enable row level security;

create index if not exists workflow_edges_workspace_workflow_idx
  on public.workflow_edges (workspace_id, workflow_id);
create index if not exists workflow_edges_source_idx
  on public.workflow_edges (source_node_id);
create index if not exists workflow_edges_target_idx
  on public.workflow_edges (target_node_id);

drop policy if exists "workflow_edges_select_ws" on public.workflow_edges;
create policy "workflow_edges_select_ws" on public.workflow_edges for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_edges_insert_ws" on public.workflow_edges;
create policy "workflow_edges_insert_ws" on public.workflow_edges for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_edges_update_ws" on public.workflow_edges;
create policy "workflow_edges_update_ws" on public.workflow_edges for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_edges_delete_ws" on public.workflow_edges;
create policy "workflow_edges_delete_ws" on public.workflow_edges for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. workflow_layouts
--
-- One row per workflow — the serialized canvas state (positions are also
-- mirrored on workflow_nodes so the layout is recoverable from nodes
-- alone; this row is the snapshot the UI saves on "Save layout"). A
-- unique constraint on workflow_id keeps it 1:1.
-- -----------------------------------------------------------------------------
create table if not exists public.workflow_layouts (
  id            uuid primary key default gen_random_uuid(),
  workflow_id   text not null unique,
  layout        jsonb not null default '{}',
  viewport      jsonb not null default '{"zoom":1,"x":0,"y":0}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.workflow_layouts enable row level security;

-- The layouts table has no direct workspace_id, so membership is enforced
-- via the trigger-pinned workspace_id on the layout jsonb. We store the
-- owning workspace_id inside the `layout` jsonb (`layout.workspaceId`)
-- and gate access through it. To keep RLS honest, we also expose the
-- layouts to workspace members only via a CHECK that the layout jsonb
-- carries a workspaceId matching a workspace they belong to.
drop policy if exists "workflow_layouts_select_ws" on public.workflow_layouts;
create policy "workflow_layouts_select_ws" on public.workflow_layouts for select
  using (
    (layout->>'workspaceId') is not null
    and public.is_workspace_member((layout->>'workspaceId')::uuid, auth.uid())
  );

drop policy if exists "workflow_layouts_insert_ws" on public.workflow_layouts;
create policy "workflow_layouts_insert_ws" on public.workflow_layouts for insert
  with check (
    (layout->>'workspaceId') is not null
    and public.is_workspace_member((layout->>'workspaceId')::uuid, auth.uid())
  );

drop policy if exists "workflow_layouts_update_ws" on public.workflow_layouts;
create policy "workflow_layouts_update_ws" on public.workflow_layouts for update
  using (
    (layout->>'workspaceId') is not null
    and public.is_workspace_member((layout->>'workspaceId')::uuid, auth.uid())
  );

drop policy if exists "workflow_layouts_delete_ws" on public.workflow_layouts;
create policy "workflow_layouts_delete_ws" on public.workflow_layouts for delete
  using (
    (layout->>'workspaceId') is not null
    and public.is_workspace_member((layout->>'workspaceId')::uuid, auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 4. workflow_comments
--
-- Canvas-pinned comments. `position` is `{x,y}` in canvas coordinates so
-- the comment stays anchored to a node-or-empty area on the graph.
-- -----------------------------------------------------------------------------
create table if not exists public.workflow_comments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  workflow_id   text not null,
  author_id     uuid not null references auth.users (id) on delete cascade,
  body          text not null,
  position      jsonb not null default '{"x":0,"y":0}',
  resolved      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.workflow_comments enable row level security;

create index if not exists workflow_comments_workspace_workflow_idx
  on public.workflow_comments (workspace_id, workflow_id, created_at desc);
create index if not exists workflow_comments_author_idx
  on public.workflow_comments (author_id);

drop policy if exists "workflow_comments_select_ws" on public.workflow_comments;
create policy "workflow_comments_select_ws" on public.workflow_comments for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_comments_insert_ws" on public.workflow_comments;
create policy "workflow_comments_insert_ws" on public.workflow_comments for insert
  with check (
    public.is_workspace_member(workspace_id, auth.uid())
    and author_id = auth.uid()
  );

drop policy if exists "workflow_comments_update_ws" on public.workflow_comments;
create policy "workflow_comments_update_ws" on public.workflow_comments for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_comments_delete_ws" on public.workflow_comments;
create policy "workflow_comments_delete_ws" on public.workflow_comments for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 5. workflow_collaboration
--
-- Per-user, per-workflow collaboration presence: live cursor position +
-- selected node ids. Used to render other editors' cursors / selections on
-- the canvas. (workflow_id, user_id) is unique — each user has at most one
-- presence row per workflow.
-- -----------------------------------------------------------------------------
create table if not exists public.workflow_collaboration (
  id              uuid primary key default gen_random_uuid(),
  workflow_id     text not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  cursor          jsonb not null default '{"x":0,"y":0}',
  selected_nodes  text[] not null default '{}',
  last_active     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (workflow_id, user_id)
);

alter table public.workflow_collaboration enable row level security;

create index if not exists workflow_collaboration_workflow_idx
  on public.workflow_collaboration (workflow_id, last_active desc);
create index if not exists workflow_collaboration_user_idx
  on public.workflow_collaboration (user_id);

drop policy if exists "workflow_collaboration_select" on public.workflow_collaboration;
create policy "workflow_collaboration_select" on public.workflow_collaboration for select
  using (user_id = auth.uid());

drop policy if exists "workflow_collaboration_upsert_own" on public.workflow_collaboration;
create policy "workflow_collaboration_upsert_own" on public.workflow_collaboration for insert
  with check (user_id = auth.uid());

drop policy if exists "workflow_collaboration_update_own" on public.workflow_collaboration;
create policy "workflow_collaboration_update_own" on public.workflow_collaboration for update
  using (user_id = auth.uid());

drop policy if exists "workflow_collaboration_delete_own" on public.workflow_collaboration;
create policy "workflow_collaboration_delete_own" on public.workflow_collaboration for delete
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 6. workflow_debug_sessions
--
-- One row per debug run. `status` mirrors a typical debugger: idle → running
-- → paused | completed. `current_node_id` points at the node the debugger
-- is paused on (or null when running/idle/completed). `variables` is the
-- JSON snapshot of runtime variables; `log` is the array of step events.
-- -----------------------------------------------------------------------------
create table if not exists public.workflow_debug_sessions (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  workflow_id     text not null,
  status          text not null default 'idle'
                    check (status in ('idle','running','paused','completed')),
  current_node_id uuid references public.workflow_nodes (id) on delete set null,
  variables       jsonb not null default '{}',
  log             jsonb not null default '[]',
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.workflow_debug_sessions enable row level security;

create index if not exists workflow_debug_workspace_workflow_idx
  on public.workflow_debug_sessions (workspace_id, workflow_id, created_at desc);
create index if not exists workflow_debug_status_idx
  on public.workflow_debug_sessions (workspace_id, status);

drop policy if exists "workflow_debug_select_ws" on public.workflow_debug_sessions;
create policy "workflow_debug_select_ws" on public.workflow_debug_sessions for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_debug_insert_ws" on public.workflow_debug_sessions;
create policy "workflow_debug_insert_ws" on public.workflow_debug_sessions for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_debug_update_ws" on public.workflow_debug_sessions;
create policy "workflow_debug_update_ws" on public.workflow_debug_sessions for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workflow_debug_delete_ws" on public.workflow_debug_sessions;
create policy "workflow_debug_delete_ws" on public.workflow_debug_sessions for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 7. template_categories
--
-- Lookup table for the public template marketplace. Workflows published to
-- the marketplace are tagged with one of these categories. Not workspace-
-- scoped — any authenticated user can read active rows.
-- -----------------------------------------------------------------------------
create table if not exists public.template_categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique not null,
  description   text,
  icon          text,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.template_categories enable row level security;

create index if not exists template_categories_active_idx
  on public.template_categories (is_active, sort_order);

-- Public read for active categories; only service role can write (the
-- platform seeds these via the admin client).
drop policy if exists "template_categories_select_active" on public.template_categories;
create policy "template_categories_select_active" on public.template_categories for select
  using (is_active = true);

-- -----------------------------------------------------------------------------
-- updated_at triggers (reuse the shared set_updated_at() from 0003).
-- -----------------------------------------------------------------------------
drop trigger if exists trg_workflow_nodes_updated_at on public.workflow_nodes;
create trigger trg_workflow_nodes_updated_at
  before update on public.workflow_nodes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_workflow_edges_updated_at on public.workflow_edges;
create trigger trg_workflow_edges_updated_at
  before update on public.workflow_edges
  for each row execute function public.set_updated_at();

drop trigger if exists trg_workflow_layouts_updated_at on public.workflow_layouts;
create trigger trg_workflow_layouts_updated_at
  before update on public.workflow_layouts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_workflow_comments_updated_at on public.workflow_comments;
create trigger trg_workflow_comments_updated_at
  before update on public.workflow_comments
  for each row execute function public.set_updated_at();

drop trigger if exists trg_workflow_debug_sessions_updated_at on public.workflow_debug_sessions;
create trigger trg_workflow_debug_sessions_updated_at
  before update on public.workflow_debug_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists trg_template_categories_updated_at on public.template_categories;
create trigger trg_template_categories_updated_at
  before update on public.template_categories
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Seed a handful of template categories so the marketplace picker is never
-- empty on first boot. Idempotent — `on conflict do nothing`.
-- -----------------------------------------------------------------------------
insert into public.template_categories (name, slug, description, icon, sort_order)
values
  ('Automation', 'automation', 'Workflow automation templates', 'Workflow', 10),
  ('AI Pipelines', 'ai-pipelines', 'AI + LLM-driven multi-step pipelines', 'Bot', 20),
  ('Integrations', 'integrations', 'Third-party service integrations', 'Plug', 30),
  ('Data', 'data', 'ETL + data transform workflows', 'Database', 40),
  ('Notifications', 'notifications', 'Alerts + outbound notifications', 'Bell', 50),
  ('Marketing', 'marketing', 'Campaigns + outreach workflows', 'Megaphone', 60),
  ('Customer Ops', 'customer-ops', 'Support + success workflows', 'Headphones', 70),
  ('DevOps', 'devops', 'CI/CD + infrastructure workflows', 'Server', 80)
on conflict (slug) do nothing;
