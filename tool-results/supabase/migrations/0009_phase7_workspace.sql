-- =============================================================================
-- SUPA AI — 0009_phase7_workspace.sql
-- Phase 7 / 9: Workspace & Collaboration Platform.
--
-- Creates the `workspaces` table plus 11 workspace-scoped collaboration
-- tables (members, folders, documents, document_versions, comments,
-- knowledge_base, file_library, workspace_roles, workspace_activity,
-- workspace_mentions, workspace_invitations).
--
-- CRITICAL: The `is_workspace_member(ws_id, user_id)` SQL function is created
-- FIRST. Every RLS policy on every workspace-scoped table in the platform
-- (including the Phase 9C `ai_employees` family from migration 0014) calls
-- this function. Until Phase 9A shipped this function, those policies
-- silently denied every row. Now they work for real.
--
-- Design principles (carried from 0001):
--   • Idempotent — every statement is safe to re-run.
--   • RLS on every new table. Default-deny. No `USING (true)` open policies.
--   • Money is integer cents. Timestamps are timestamptz.
--   • updated_at maintained by the shared set_updated_at() trigger from 0003.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. is_workspace_member(ws_id, user_id) — SECURITY DEFINER
--
-- Returns true iff `user_id` is an `active` member of workspace `ws_id`.
-- Marked SECURITY DEFINER so it can be inlined into RLS policies on tables
-- the caller does not own (workspaces, workspace_members themselves).
-- Search path pinned to `public` to prevent trojan-horse schema attacks.
-- -----------------------------------------------------------------------------
create or replace function public.is_workspace_member(ws_id uuid, user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = ws_id
      and wm.user_id = user_id
      and wm.status = 'active'
  );
$$;

-- =============================================================================
-- 1. workspaces
-- =============================================================================
create table if not exists public.workspaces (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text unique not null,
  description         text,
  logo_url            text,
  type                text not null default 'team'
                        check (type in ('personal','team','organization')),
  owner_id            uuid not null references auth.users (id) on delete cascade,
  billing_owner_id    uuid references auth.users (id) on delete set null,
  settings            jsonb not null default '{}',
  storage_used_bytes  bigint not null default 0,
  ai_credits_pool     integer not null default 0,
  is_archived         boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.workspaces enable row level security;

create index if not exists workspaces_slug_idx on public.workspaces (slug);
create index if not exists workspaces_owner_idx on public.workspaces (owner_id);
create index if not exists workspaces_name_fts_idx on public.workspaces
  using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));

-- Owner can always read/write their workspaces; active members can read.
drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member" on public.workspaces for select
  using (owner_id = auth.uid() or public.is_workspace_member(id, auth.uid()));

drop policy if exists "workspaces_insert_owner" on public.workspaces;
create policy "workspaces_insert_owner" on public.workspaces for insert
  with check (owner_id = auth.uid());

drop policy if exists "workspaces_update_owner_admin" on public.workspaces;
create policy "workspaces_update_owner_admin" on public.workspaces for update
  using (owner_id = auth.uid());

drop policy if exists "workspaces_delete_owner" on public.workspaces;
create policy "workspaces_delete_owner" on public.workspaces for delete
  using (owner_id = auth.uid());

-- =============================================================================
-- 2. workspace_members
-- =============================================================================
create table if not exists public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null default 'member'
                  check (role in ('owner','admin','editor','viewer','member')),
  status        text not null default 'active'
                  check (status in ('active','invited','suspended','removed')),
  invited_by    uuid references auth.users (id) on delete set null,
  invited_at    timestamptz not null default now(),
  joined_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);

alter table public.workspace_members enable row level security;

create index if not exists workspace_members_workspace_idx on public.workspace_members (workspace_id, role);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id, status);

-- Members of a workspace can read its member list. A user can always read their
-- own rows so they can see pending invitations addressed to them.
drop policy if exists "workspace_members_select_ws" on public.workspace_members;
create policy "workspace_members_select_ws" on public.workspace_members for select
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id, auth.uid())
  );

-- A user can self-insert to accept an invitation; otherwise the workspace owner
-- or an admin invites. We accept either path here — the service layer enforces
-- the invite-token + role check before reaching this policy.
drop policy if exists "workspace_members_insert_ws" on public.workspace_members;
create policy "workspace_members_insert_ws" on public.workspace_members for insert
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.workspaces w
      where w.id = workspace_id
        and (w.owner_id = auth.uid() or public.is_workspace_member(w.id, auth.uid()))
    )
  );

drop policy if exists "workspace_members_update_ws" on public.workspace_members;
create policy "workspace_members_update_ws" on public.workspace_members for update
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id, auth.uid())
  );

drop policy if exists "workspace_members_delete_ws" on public.workspace_members;
create policy "workspace_members_delete_ws" on public.workspace_members for delete
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id, auth.uid())
  );

-- =============================================================================
-- 3. folders (workspace document tree)
-- =============================================================================
create table if not exists public.folders (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  parent_id     uuid references public.folders (id) on delete cascade,
  name          text not null,
  path          text not null default '/',
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.folders enable row level security;

create index if not exists folders_workspace_idx on public.folders (workspace_id, parent_id);
create index if not exists folders_path_idx on public.folders (workspace_id, path);

drop policy if exists "folders_ws" on public.folders;
create policy "folders_ws" on public.folders for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "folders_ws_write" on public.folders;
create policy "folders_ws_write" on public.folders for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "folders_ws_update" on public.folders;
create policy "folders_ws_update" on public.folders for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "folders_ws_delete" on public.folders;
create policy "folders_ws_delete" on public.folders for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 4. documents
-- =============================================================================
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  folder_id     uuid references public.folders (id) on delete set null,
  title         text not null,
  content       text,
  content_type  text not null default 'markdown'
                  check (content_type in ('markdown','plain','html','json')),
  status        text not null default 'draft'
                  check (status in ('draft','published','archived')),
  version       integer not null default 1,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.documents enable row level security;

create index if not exists documents_workspace_idx on public.documents (workspace_id, updated_at desc);
create index if not exists documents_folder_idx on public.documents (folder_id);
create index if not exists documents_title_fts_idx on public.documents
  using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));

drop policy if exists "documents_ws" on public.documents;
create policy "documents_ws" on public.documents for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "documents_ws_write" on public.documents;
create policy "documents_ws_write" on public.documents for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "documents_ws_update" on public.documents;
create policy "documents_ws_update" on public.documents for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "documents_ws_delete" on public.documents;
create policy "documents_ws_delete" on public.documents for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 5. document_versions (immutable history)
-- =============================================================================
create table if not exists public.document_versions (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete cascade,
  version       integer not null,
  content       text,
  changed_by    uuid references auth.users (id) on delete set null,
  changed_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (document_id, version)
);

alter table public.document_versions enable row level security;

create index if not exists document_versions_doc_idx on public.document_versions (document_id, version desc);

drop policy if exists "document_versions_ws" on public.document_versions;
create policy "document_versions_ws" on public.document_versions for select
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_versions.document_id
        and public.is_workspace_member(d.workspace_id, auth.uid())
    )
  );

drop policy if exists "document_versions_ws_write" on public.document_versions;
create policy "document_versions_ws_write" on public.document_versions for insert
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_versions.document_id
        and public.is_workspace_member(d.workspace_id, auth.uid())
    )
  );

-- =============================================================================
-- 6. comments (threaded)
-- =============================================================================
create table if not exists public.comments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  document_id   uuid references public.documents (id) on delete cascade,
  parent_id     uuid references public.comments (id) on delete cascade,
  author_id     uuid not null references auth.users (id) on delete cascade,
  body         text not null,
  resolved     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.comments enable row level security;

create index if not exists comments_workspace_idx on public.comments (workspace_id, created_at desc);
create index if not exists comments_document_idx on public.comments (document_id, created_at desc);
create index if not exists comments_parent_idx on public.comments (parent_id);

drop policy if exists "comments_ws" on public.comments;
create policy "comments_ws" on public.comments for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "comments_ws_write" on public.comments;
create policy "comments_ws_write" on public.comments for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()) and author_id = auth.uid());

drop policy if exists "comments_ws_update" on public.comments;
create policy "comments_ws_update" on public.comments for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "comments_ws_delete" on public.comments;
create policy "comments_ws_delete" on public.comments for delete
  using (public.is_workspace_member(workspace_id, auth.uid()) and author_id = auth.uid());

-- =============================================================================
-- 7. knowledge_base
-- =============================================================================
create table if not exists public.knowledge_base (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  title         text not null,
  content       text,
  source        text,
  source_id     uuid,
  source_type   text check (source_type in ('document','file','url','manual','ai-generated')),
  tags          text[] not null default '{}',
  metadata      jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.knowledge_base enable row level security;

create index if not exists knowledge_base_workspace_idx on public.knowledge_base (workspace_id, updated_at desc);
create index if not exists knowledge_base_title_fts_idx on public.knowledge_base
  using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));
create index if not exists knowledge_base_tags_idx on public.knowledge_base using gin (tags);

drop policy if exists "knowledge_base_ws" on public.knowledge_base;
create policy "knowledge_base_ws" on public.knowledge_base for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "knowledge_base_ws_write" on public.knowledge_base;
create policy "knowledge_base_ws_write" on public.knowledge_base for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "knowledge_base_ws_update" on public.knowledge_base;
create policy "knowledge_base_ws_update" on public.knowledge_base for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "knowledge_base_ws_delete" on public.knowledge_base;
create policy "knowledge_base_ws_delete" on public.knowledge_base for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 8. file_library
-- =============================================================================
create table if not exists public.file_library (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  folder_id     uuid references public.folders (id) on delete set null,
  file_name     text not null,
  file_path     text not null,
  file_size     bigint not null default 0,
  mime_type     text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.file_library enable row level security;

create index if not exists file_library_workspace_idx on public.file_library (workspace_id, created_at desc);
create index if not exists file_library_folder_idx on public.file_library (folder_id);

drop policy if exists "file_library_ws" on public.file_library;
create policy "file_library_ws" on public.file_library for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "file_library_ws_write" on public.file_library;
create policy "file_library_ws_write" on public.file_library for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "file_library_ws_delete" on public.file_library;
create policy "file_library_ws_delete" on public.file_library for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 9. workspace_roles (custom per-workspace roles)
-- =============================================================================
create table if not exists public.workspace_roles (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null,
  permissions   jsonb not null default '{}',
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, name)
);

alter table public.workspace_roles enable row level security;

create index if not exists workspace_roles_workspace_idx on public.workspace_roles (workspace_id);

drop policy if exists "workspace_roles_ws" on public.workspace_roles;
create policy "workspace_roles_ws" on public.workspace_roles for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workspace_roles_ws_write" on public.workspace_roles;
create policy "workspace_roles_ws_write" on public.workspace_roles for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workspace_roles_ws_update" on public.workspace_roles;
create policy "workspace_roles_ws_update" on public.workspace_roles for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workspace_roles_ws_delete" on public.workspace_roles;
create policy "workspace_roles_ws_delete" on public.workspace_roles for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 10. workspace_activity (audit feed)
-- =============================================================================
create table if not exists public.workspace_activity (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  action        text not null,
  resource_type text,
  resource_id   uuid,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

alter table public.workspace_activity enable row level security;

create index if not exists workspace_activity_workspace_idx on public.workspace_activity (workspace_id, created_at desc);
create index if not exists workspace_activity_resource_idx on public.workspace_activity (resource_type, resource_id);

drop policy if exists "workspace_activity_ws" on public.workspace_activity;
create policy "workspace_activity_ws" on public.workspace_activity for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workspace_activity_ws_write" on public.workspace_activity;
create policy "workspace_activity_ws_write" on public.workspace_activity for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 11. workspace_mentions
-- =============================================================================
create table if not exists public.workspace_mentions (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  document_id         uuid references public.documents (id) on delete cascade,
  comment_id          uuid references public.comments (id) on delete cascade,
  mentioned_user_id   uuid not null references auth.users (id) on delete cascade,
  mentioned_by         uuid references auth.users (id) on delete set null,
  is_read             boolean not null default false,
  created_at          timestamptz not null default now()
);

alter table public.workspace_mentions enable row level security;

create index if not exists workspace_mentions_user_idx on public.workspace_mentions (mentioned_user_id, is_read, created_at desc);
create index if not exists workspace_mentions_workspace_idx on public.workspace_mentions (workspace_id, created_at desc);

drop policy if exists "workspace_mentions_ws" on public.workspace_mentions;
create policy "workspace_mentions_ws" on public.workspace_mentions for select
  using (
    mentioned_user_id = auth.uid()
    or public.is_workspace_member(workspace_id, auth.uid())
  );

drop policy if exists "workspace_mentions_ws_write" on public.workspace_mentions;
create policy "workspace_mentions_ws_write" on public.workspace_mentions for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workspace_mentions_ws_update" on public.workspace_mentions;
create policy "workspace_mentions_ws_update" on public.workspace_mentions for update
  using (mentioned_user_id = auth.uid() or public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 12. workspace_invitations
-- =============================================================================
create table if not exists public.workspace_invitations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  email         text not null,
  role          text not null default 'member'
                  check (role in ('owner','admin','editor','viewer','member')),
  token         text not null unique,
  invited_by    uuid not null references auth.users (id) on delete cascade,
  expires_at    timestamptz not null default (now() + interval '7 days'),
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.workspace_invitations enable row level security;

create index if not exists workspace_invitations_workspace_idx on public.workspace_invitations (workspace_id, created_at desc);
create index if not exists workspace_invitations_email_idx on public.workspace_invitations (email, accepted_at);
create index if not exists workspace_invitations_token_idx on public.workspace_invitations (token);

drop policy if exists "workspace_invitations_ws" on public.workspace_invitations;
create policy "workspace_invitations_ws" on public.workspace_invitations for select
  using (
    public.is_workspace_member(workspace_id, auth.uid())
    or email in (
      select coalesce(email, '') from public.users where id = auth.uid()
    )
  );

drop policy if exists "workspace_invitations_ws_write" on public.workspace_invitations;
create policy "workspace_invitations_ws_write" on public.workspace_invitations for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workspace_invitations_ws_update" on public.workspace_invitations;
create policy "workspace_invitations_ws_update" on public.workspace_invitations for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workspace_invitations_ws_delete" on public.workspace_invitations;
create policy "workspace_invitations_ws_delete" on public.workspace_invitations for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- updated_at triggers (re-using the shared set_updated_at() from 0003)
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'workspaces',
    'workspace_members',
    'folders',
    'documents',
    'comments',
    'knowledge_base',
    'workspace_roles'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at();',
      t
    );
  end loop;
end;
$$;

-- =============================================================================
-- Realtime
-- =============================================================================
alter publication supabase_realtime add table public.documents;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.workspace_activity;
alter publication supabase_realtime add table public.workspace_mentions;
