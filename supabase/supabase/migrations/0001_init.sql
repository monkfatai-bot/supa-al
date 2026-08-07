-- =============================================================================
-- SUPA AI — 0001_init.sql
-- Core schema: users, organizations, members, subscriptions, usage, api_keys,
-- ai_conversations, ai_messages, files.
--
-- Design principles:
--   • Idempotent — safe to re-run on existing databases (CREATE ... IF NOT EXISTS).
--   • RLS on every table. Default-deny. No `USING (true)` open policies.
--   • `handle_new_user()` trigger mirrors the standard Supabase pattern so a
--     `public.users` row is auto-created on signup.
--   • Money is stored as integer cents (no floating-point arithmetic).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "uuid-ossp";  -- uuid_generate_v4() (fallback)

-- -----------------------------------------------------------------------------
-- public.users — application profile mirroring auth.users
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  role        text not null default 'member',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.users enable row level security;

-- Users can read their own row.
drop policy if exists "users_select_self" on public.users;
create policy "users_select_self"
  on public.users for select
  using (auth.uid() = id);

-- Users can update (but not create/delete) their own profile.
drop policy if exists "users_update_self" on public.users;
create policy "users_update_self"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- public.organizations
-- -----------------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  slug        text unique,
  owner_id    uuid references public.users (id) on delete set null,
  plan        text not null default 'free',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.organizations enable row level security;

-- Members of an org can read its row.
drop policy if exists "organizations_select_members" on public.organizations;
create policy "organizations_select_members"
  on public.organizations for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = organizations.id and m.user_id = auth.uid()
    )
  );

-- Any authenticated user can create an org (they will become the owner).
drop policy if exists "organizations_insert_authenticated" on public.organizations;
create policy "organizations_insert_authenticated"
  on public.organizations for insert
  with check (
    auth.uid() is not null
    and owner_id = auth.uid()
  );

-- Owner or admin of an org can update its row.
drop policy if exists "organizations_update_owner_admin" on public.organizations;
create policy "organizations_update_owner_admin"
  on public.organizations for update
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = organizations.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.organization_members m
      where m.org_id = organizations.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- Only the owner can delete an org.
drop policy if exists "organizations_delete_owner" on public.organizations;
create policy "organizations_delete_owner"
  on public.organizations for delete
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = organizations.id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- -----------------------------------------------------------------------------
-- public.organization_members
-- -----------------------------------------------------------------------------
create table if not exists public.organization_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  role        text not null default 'member'
                check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

alter table public.organization_members enable row level security;

-- Members of an org can list all members of that org.
drop policy if exists "members_select_same_org" on public.organization_members;
create policy "members_select_same_org"
  on public.organization_members for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = organization_members.org_id
        and m.user_id = auth.uid()
    )
  );

-- A user may insert their own owner membership when creating an org (the
-- org's owner_id matches their uid), OR an existing admin/owner may invite
-- a new member.
drop policy if exists "members_insert_self_or_admin" on public.organization_members;
create policy "members_insert_self_or_admin"
  on public.organization_members for insert
  with check (
    -- (a) self-joining as owner when creating the org
    (
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1 from public.organizations o
        where o.id = org_id and o.owner_id = auth.uid()
      )
    )
    -- (b) invited by an existing admin/owner of the org
    or (
      exists (
        select 1 from public.organization_members m
        where m.org_id = organization_members.org_id
          and m.user_id = auth.uid()
          and m.role in ('owner', 'admin')
      )
    )
  );

-- Admins/owners can update a member's role (e.g. promote/demote). They cannot
-- downgrade themselves to break the invariant that an org always has >=1
-- owner — that constraint is enforced in application code.
drop policy if exists "members_update_admin" on public.organization_members;
create policy "members_update_admin"
  on public.organization_members for update
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = organization_members.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.organization_members m
      where m.org_id = organization_members.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- A user may remove themselves; otherwise admins/owners may remove members.
drop policy if exists "members_delete_self_or_admin" on public.organization_members;
create policy "members_delete_self_or_admin"
  on public.organization_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = organization_members.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- -----------------------------------------------------------------------------
-- public.subscriptions
-- -----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid references public.organizations (id) on delete cascade,
  provider                    text,
  provider_customer_id        text,
  provider_subscription_id    text,
  status                      text,
  current_period_end          timestamptz,
  cancel_at_period_end        boolean,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Org members can read their subscription.
drop policy if exists "subscriptions_select_members" on public.subscriptions;
create policy "subscriptions_select_members"
  on public.subscriptions for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = subscriptions.org_id and m.user_id = auth.uid()
    )
  );

-- Inserts/updates/deletes are admin/owner only (Stripe webhook callbacks use
-- the service role and bypass RLS).
drop policy if exists "subscriptions_write_admin" on public.subscriptions;
create policy "subscriptions_write_admin"
  on public.subscriptions for all
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = subscriptions.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.organization_members m
        where m.org_id = subscriptions.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- -----------------------------------------------------------------------------
-- public.usage_records
-- -----------------------------------------------------------------------------
create table if not exists public.usage_records (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid,
  user_id         uuid references public.users (id) on delete set null,
  feature         text,        -- 'chat' | 'image_generation' | ...
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  cost_cents      integer,     -- integer cents; never float
  created_at      timestamptz not null default now()
);

alter table public.usage_records enable row level security;

drop index if exists usage_records_org_created_idx;
create index if not exists usage_records_org_created_idx
  on public.usage_records (org_id, created_at desc);

-- A user can read their own usage OR usage for any org they belong to.
drop policy if exists "usage_select_self_or_org" on public.usage_records;
create policy "usage_select_self_or_org"
  on public.usage_records for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = usage_records.org_id and m.user_id = auth.uid()
    )
  );

-- Any authenticated user can write usage rows for themselves (the API layer
-- enforces that org_id belongs to them). This keeps the policy simple while
-- the application layer does the fine-grained checks.
drop policy if exists "usage_insert_self" on public.usage_records;
create policy "usage_insert_self"
  on public.usage_records for insert
  with check (user_id = auth.uid());

-- Usage records are append-only from the client; updates/deletes are
-- reserved for service-role reconciliation jobs.

-- -----------------------------------------------------------------------------
-- public.api_keys
-- -----------------------------------------------------------------------------
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  name          text,
  key_prefix    text,                 -- first ~8 chars shown in UI
  hashed_key    text,                 -- sha256 hex of the full key
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

alter table public.api_keys enable row level security;

drop policy if exists "api_keys_select_owner" on public.api_keys;
create policy "api_keys_select_owner"
  on public.api_keys for select
  using (user_id = auth.uid());

drop policy if exists "api_keys_insert_owner" on public.api_keys;
create policy "api_keys_insert_owner"
  on public.api_keys for insert
  with check (user_id = auth.uid());

drop policy if exists "api_keys_update_owner" on public.api_keys;
create policy "api_keys_update_owner"
  on public.api_keys for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "api_keys_delete_owner" on public.api_keys;
create policy "api_keys_delete_owner"
  on public.api_keys for delete
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- public.ai_conversations
-- -----------------------------------------------------------------------------
create table if not exists public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users (id) on delete set null,
  org_id      uuid references public.organizations (id) on delete set null,
  title       text,
  provider    text,
  model       text,
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.ai_conversations enable row level security;

drop index if exists ai_conversations_user_created_idx;
create index if not exists ai_conversations_user_created_idx
  on public.ai_conversations (user_id, created_at desc);

-- Owner of the conversation OR any member of the conversation's org.
drop policy if exists "ai_conversations_select_owner_or_org" on public.ai_conversations;
create policy "ai_conversations_select_owner_or_org"
  on public.ai_conversations for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = ai_conversations.org_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "ai_conversations_insert_owner" on public.ai_conversations;
create policy "ai_conversations_insert_owner"
  on public.ai_conversations for insert
  with check (
    user_id = auth.uid()
    and (
      org_id is null
      or exists (
        select 1 from public.organization_members m
        where m.org_id = ai_conversations.org_id and m.user_id = auth.uid()
      )
    )
  );

drop policy if exists "ai_conversations_update_owner_or_admin" on public.ai_conversations;
create policy "ai_conversations_update_owner_or_admin"
  on public.ai_conversations for update
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = ai_conversations.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = ai_conversations.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists "ai_conversations_delete_owner_or_admin" on public.ai_conversations;
create policy "ai_conversations_delete_owner_or_admin"
  on public.ai_conversations for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = ai_conversations.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- -----------------------------------------------------------------------------
-- public.ai_messages
-- -----------------------------------------------------------------------------
create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role            text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content         jsonb,
  tokens          integer,
  created_at      timestamptz not null default now()
);

alter table public.ai_messages enable row level security;

drop index if exists ai_messages_conversation_created_idx;
create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages (conversation_id, created_at);

-- A user can read messages in any conversation they can read (owner or org member).
drop policy if exists "ai_messages_select_via_conversation" on public.ai_messages;
create policy "ai_messages_select_via_conversation"
  on public.ai_messages for select
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and (
          c.user_id = auth.uid()
          or exists (
            select 1 from public.organization_members m
            where m.org_id = c.org_id and m.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "ai_messages_insert_via_conversation" on public.ai_messages;
create policy "ai_messages_insert_via_conversation"
  on public.ai_messages for insert
  with check (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and (
          c.user_id = auth.uid()
          or exists (
            select 1 from public.organization_members m
            where m.org_id = c.org_id and m.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "ai_messages_delete_owner_or_admin" on public.ai_messages;
create policy "ai_messages_delete_owner_or_admin"
  on public.ai_messages for delete
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and (
          c.user_id = auth.uid()
          or exists (
            select 1 from public.organization_members m
            where m.org_id = c.org_id
              and m.user_id = auth.uid()
              and m.role in ('owner', 'admin')
          )
        )
    )
  );

-- ai_messages are append-only; updates are not permitted from the client.

-- -----------------------------------------------------------------------------
-- public.files
-- -----------------------------------------------------------------------------
create table if not exists public.files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  org_id        uuid references public.organizations (id) on delete set null,
  storage_path  text not null,
  filename      text,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);

alter table public.files enable row level security;

drop policy if exists "files_select_owner_or_org" on public.files;
create policy "files_select_owner_or_org"
  on public.files for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = files.org_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "files_insert_owner" on public.files;
create policy "files_insert_owner"
  on public.files for insert
  with check (
    user_id = auth.uid()
    and (
      org_id is null
      or exists (
        select 1 from public.organization_members m
        where m.org_id = files.org_id and m.user_id = auth.uid()
      )
    )
  );

drop policy if exists "files_update_owner_or_admin" on public.files;
create policy "files_update_owner_or_admin"
  on public.files for update
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = files.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
        where m.org_id = files.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists "files_delete_owner_or_admin" on public.files;
create policy "files_delete_owner_or_admin"
  on public.files for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = files.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- -----------------------------------------------------------------------------
-- Trigger: auto-create a public.users row on auth.users insert.
-- Standard Supabase pattern. SECURITY DEFINER so it can write to public.users
-- even though the caller is the new (unauthenticated-after-signup) session.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
