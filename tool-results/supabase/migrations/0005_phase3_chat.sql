-- =============================================================================
-- SUPA AI — 0005_phase3_chat.sql
-- Phase 3: AI Chat Engine & Multi-Model Platform.
--
-- Expands the Phase 1 ai_conversations / ai_messages tables with Phase 3
-- features (folders, pinning, archiving, search, attachments, cost tracking)
-- and adds new tables: prompt_templates, ai_models, provider_health,
-- conversation_folders, message_attachments.
--
-- Design principles (carried from 0001):
--   • Idempotent — every statement is safe to re-run.
--   • RLS on every new table. Default-deny. No `USING (true)` open policies.
--   • Money is integer cents. Timestamps are timestamptz.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Expand ai_conversations (add columns for Phase 3 features)
-- -----------------------------------------------------------------------------
do $$
begin
  -- Folder association.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_conversations' and column_name='folder_id'
  ) then
    alter table public.ai_conversations add column folder_id uuid;
  end if;

  -- Pinned to top.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_conversations' and column_name='pinned'
  ) then
    alter table public.ai_conversations add column pinned boolean not null default false;
  end if;

  -- Archived (soft-delete from active list).
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_conversations' and column_name='archived'
  ) then
    alter table public.ai_conversations add column archived boolean not null default false;
  end if;

  -- System prompt for the conversation.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_conversations' and column_name='system_prompt'
  ) then
    alter table public.ai_conversations add column system_prompt text;
  end if;

  -- Last message preview (for sidebar list, avoids a join).
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_conversations' and column_name='last_message_preview'
  ) then
    alter table public.ai_conversations add column last_message_preview text;
  end if;

  -- Last message timestamp (for sidebar sorting).
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_conversations' and column_name='last_message_at'
  ) then
    alter table public.ai_conversations add column last_message_at timestamptz;
  end if;

  -- Message count (denormalized for sidebar).
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_conversations' and column_name='message_count'
  ) then
    alter table public.ai_conversations add column message_count integer not null default 0;
  end if;

  -- Total tokens used in this conversation (denormalized).
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_conversations' and column_name='total_tokens'
  ) then
    alter table public.ai_conversations add column total_tokens integer not null default 0;
  end if;

  -- Total estimated cost in cents (denormalized).
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_conversations' and column_name='total_cost_cents'
  ) then
    alter table public.ai_conversations add column total_cost_cents integer not null default 0;
  end if;
end$$;

-- Add FK for folder_id (after column exists).
do $$
begin
  -- Drop + re-add to be idempotent.
  execute 'alter table public.ai_conversations drop constraint if exists ai_conversations_folder_id_fkey';
end$$;

-- (FK added after conversation_folders is created below.)

-- Indexes for the expanded conversation queries.
create index if not exists ai_conversations_user_pinned_idx
  on public.ai_conversations (user_id, pinned desc, last_message_at desc)
  where archived = false;

create index if not exists ai_conversations_user_archived_idx
  on public.ai_conversations (user_id, archived, updated_at desc);

create index if not exists ai_conversations_folder_idx
  on public.ai_conversations (folder_id)
  where folder_id is not null;

-- Full-text search on title + last_message_preview.
create index if not exists ai_conversations_title_preview_fts_idx
  on public.ai_conversations
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(last_message_preview, '')));

-- -----------------------------------------------------------------------------
-- 2. Expand ai_messages (add columns for Phase 3 cost + latency tracking)
-- -----------------------------------------------------------------------------
do $$
begin
  -- Provider used for this message.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_messages' and column_name='provider'
  ) then
    alter table public.ai_messages add column provider text;
  end if;

  -- Model used for this message (already in ai_conversations, but per-message
  -- allows model switching mid-conversation).
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_messages' and column_name='model'
  ) then
    alter table public.ai_messages add column model text;
  end if;

  -- Input tokens for this message.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_messages' and column_name='input_tokens'
  ) then
    alter table public.ai_messages add column input_tokens integer;
  end if;

  -- Output tokens for this message.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_messages' and column_name='output_tokens'
  ) then
    alter table public.ai_messages add column output_tokens integer;
  end if;

  -- Total tokens (input + output) for convenience.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_messages' and column_name='total_tokens'
  ) then
    alter table public.ai_messages add column total_tokens integer;
  end if;

  -- Estimated cost in cents.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_messages' and column_name='cost_cents'
  ) then
    alter table public.ai_messages add column cost_cents integer;
  end if;

  -- Response latency in milliseconds.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_messages' and column_name='latency_ms'
  ) then
    alter table public.ai_messages add column latency_ms integer;
  end if;

  -- Finish reason (stop/length/tool_calls/content_filter/error).
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_messages' and column_name='finish_reason'
  ) then
    alter table public.ai_messages add column finish_reason text;
  end if;

  -- Error message (if the request failed).
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_messages' and column_name='error_message'
  ) then
    alter table public.ai_messages add column error_message text;
  end if;

  -- Edit history for user messages (JSON array of previous versions).
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_messages' and column_name='edit_history'
  ) then
    alter table public.ai_messages add column edit_history jsonb;
  end if;

  -- Parent message id (for regenerate / branch chains).
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_messages' and column_name='parent_message_id'
  ) then
    alter table public.ai_messages add column parent_message_id uuid;
  end if;
end$$;

-- Index for message pagination within a conversation.
create index if not exists ai_messages_conversation_created_id_idx
  on public.ai_messages (conversation_id, created_at, id);

-- Index for branch lookups.
create index if not exists ai_messages_parent_idx
  on public.ai_messages (parent_message_id)
  where parent_message_id is not null;

-- -----------------------------------------------------------------------------
-- 3. conversation_folders
-- -----------------------------------------------------------------------------
create table if not exists public.conversation_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  color       text,                              -- hex color for the folder icon
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.conversation_folders enable row level security;

drop policy if exists "folders_select_self" on public.conversation_folders;
create policy "folders_select_self"
  on public.conversation_folders for select
  using (user_id = auth.uid());

drop policy if exists "folders_insert_self" on public.conversation_folders;
create policy "folders_insert_self"
  on public.conversation_folders for insert
  with check (user_id = auth.uid());

drop policy if exists "folders_update_self" on public.conversation_folders;
create policy "folders_update_self"
  on public.conversation_folders for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "folders_delete_self" on public.conversation_folders;
create policy "folders_delete_self"
  on public.conversation_folders for delete
  using (user_id = auth.uid());

-- Now add the FK from ai_conversations.folder_id → conversation_folders.id.
do $$
begin
  execute 'alter table public.ai_conversations drop constraint if exists ai_conversations_folder_id_fkey';
  execute 'alter table public.ai_conversations add constraint ai_conversations_folder_id_fkey '
          'foreign key (folder_id) references public.conversation_folders (id) on delete set null';
end$$;

-- -----------------------------------------------------------------------------
-- 4. message_attachments — files attached to a specific message
-- -----------------------------------------------------------------------------
create table if not exists public.message_attachments (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.ai_messages (id) on delete cascade,
  file_id       uuid not null references public.files (id) on delete cascade,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.message_attachments enable row level security;

drop index if exists message_attachments_message_idx;
create index if not exists message_attachments_message_idx
  on public.message_attachments (message_id, sort_order);

-- Access is governed by the message's conversation ownership.
drop policy if exists "attachments_select_via_message" on public.message_attachments;
create policy "attachments_select_via_message"
  on public.message_attachments for select
  using (
    exists (
      select 1 from public.ai_messages m
      join public.ai_conversations c on c.id = m.conversation_id
      where m.id = message_attachments.message_id
        and (
          c.user_id = auth.uid()
          or exists (
            select 1 from public.organization_members om
            where om.org_id = c.org_id and om.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "attachments_insert_via_message" on public.message_attachments;
create policy "attachments_insert_via_message"
  on public.message_attachments for insert
  with check (
    exists (
      select 1 from public.ai_messages m
      join public.ai_conversations c on c.id = m.conversation_id
      where m.id = message_attachments.message_id
        and c.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 5. prompt_templates
-- -----------------------------------------------------------------------------
create table if not exists public.prompt_templates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete cascade,  -- null = system/built-in
  title         text not null,
  description   text,
  category      text not null default 'general',  -- 'general'|'writing'|'coding'|'analysis'|'creative'|'business'|'custom'
  content       text not null,                     -- the prompt text, with {{variables}}
  variables     jsonb,                              -- [{name, description, defaultValue}]
  is_favorite   boolean not null default false,
  is_public     boolean not null default false,     -- system templates are public
  sort_order    integer not null default 0,
  usage_count   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.prompt_templates enable row level security;

drop index if exists prompt_templates_user_favorite_idx;
create index if not exists prompt_templates_user_favorite_idx
  on public.prompt_templates (user_id, is_favorite, updated_at desc);

drop index if not exists prompt_templates_category_idx;
create index if not exists prompt_templates_category_idx
  on public.prompt_templates (category, sort_order);

drop index if not exists prompt_templates_public_idx;
create index if not exists prompt_templates_public_idx
  on public.prompt_templates (is_public, sort_order)
  where is_public = true;

-- Owner can read their templates; everyone can read public templates.
drop policy if exists "templates_select_owner_or_public" on public.prompt_templates;
create policy "templates_select_owner_or_public"
  on public.prompt_templates for select
  using (
    is_public = true
    or user_id = auth.uid()
  );

-- Authenticated users can create their own templates.
drop policy if exists "templates_insert_self" on public.prompt_templates;
create policy "templates_insert_self"
  on public.prompt_templates for insert
  with check (
    auth.uid() is not null
    and (user_id is null or user_id = auth.uid())
  );

-- Owner can update / delete their own templates.
drop policy if exists "templates_update_self" on public.prompt_templates;
create policy "templates_update_self"
  on public.prompt_templates for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "templates_delete_self" on public.prompt_templates;
create policy "templates_delete_self"
  on public.prompt_templates for delete
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 6. ai_models — model manager catalog (overrides + enable/disable)
-- -----------------------------------------------------------------------------
create table if not exists public.ai_models (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null,                 -- 'openai'|'anthropic'|'google'|'openrouter'|'deepseek'|'qwen'|'grok'
  model_id            text not null,                 -- the provider's model identifier (e.g. 'gpt-4o-mini')
  label               text not null,                 -- human-friendly label
  context_window      integer,                       -- max combined input+output tokens
  max_output_tokens   integer,                       -- max generation
  input_cost_cents_per_1k  integer,                  -- cost in cents per 1K input tokens
  output_cost_cents_per_1k integer,                  -- cost in cents per 1K output tokens
  capabilities        jsonb,                         -- {chat, streaming, tools, vision, json_mode}
  is_enabled          boolean not null default true,
  is_default          boolean not null default false,
  sort_order          integer not null default 0,
  metadata            jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, model_id)
);

alter table public.ai_models enable row level security;

drop index if exists ai_models_enabled_idx;
create index if not exists ai_models_enabled_idx
  on public.ai_models (is_enabled, sort_order);

drop index if exists ai_models_provider_idx;
create index if not exists ai_models_provider_idx
  on public.ai_models (provider, is_enabled);

-- ai_models is a system catalog — readable by all authenticated users,
-- writable by service-role only (admin). No client insert/update/delete.
drop policy if exists "ai_models_select_authenticated" on public.ai_models;
create policy "ai_models_select_authenticated"
  on public.ai_models for select
  using (auth.uid() is not null);

-- -----------------------------------------------------------------------------
-- 7. provider_health — health monitoring + metrics
-- -----------------------------------------------------------------------------
create table if not exists public.provider_health (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null,
  status          text not null check (status in ('healthy', 'degraded', 'down', 'unknown')),
  -- Rolling metrics (updated by the health-check job).
  success_count   integer not null default 0,
  error_count     integer not null default 0,
  avg_latency_ms  integer,                          -- rolling average
  last_check_at   timestamptz,
  last_error      text,
  metadata        jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider)
);

alter table public.provider_health enable row level security;

-- Readable by authenticated users (shown in the admin dashboard); writes are
-- service-role only (the health-check job).
drop policy if exists "provider_health_select_authenticated" on public.provider_health;
create policy "provider_health_select_authenticated"
  on public.provider_health for select
  using (auth.uid() is not null);

-- -----------------------------------------------------------------------------
-- 8. ai_usage — per-request usage log (replaces the Phase 1 usage_records for
--    the chat surface; usage_records stays for org-level rollups).
-- -----------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete set null,
  org_id          uuid,
  conversation_id uuid references public.ai_conversations (id) on delete set null,
  message_id      uuid references public.ai_messages (id) on delete set null,
  provider        text not null,
  model           text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  total_tokens    integer not null default 0,
  cost_cents      integer not null default 0,
  latency_ms      integer,
  feature         text default 'chat',              -- 'chat'|'image-gen'|'summarize'|...
  status          text not null default 'success' check (status in ('success', 'error', 'timeout', 'rate_limited')),
  error_message   text,
  created_at      timestamptz not null default now()
);

alter table public.ai_usage enable row level security;

drop index if exists ai_usage_user_created_idx;
create index if not exists ai_usage_user_created_idx
  on public.ai_usage (user_id, created_at desc);

drop index if not exists ai_usage_provider_created_idx;
create index if not exists ai_usage_provider_created_idx
  on public.ai_usage (provider, created_at desc);

drop index if not exists ai_usage_feature_created_idx;
create index if not exists ai_usage_feature_created_idx
  on public.ai_usage (feature, created_at desc);

-- A user can read their own usage; org members can read their org's usage.
drop policy if exists "ai_usage_select_self_or_org" on public.ai_usage;
create policy "ai_usage_select_self_or_org"
  on public.ai_usage for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members om
      where om.org_id = ai_usage.org_id and om.user_id = auth.uid()
    )
  );

-- Inserts are done via service-role (the chat API records usage after the
-- stream completes). No client insert/update/delete policy.

-- -----------------------------------------------------------------------------
-- 9. updated_at triggers for the new tables.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  new_tables text[] := array['conversation_folders', 'prompt_templates', 'ai_models', 'provider_health'];
begin
  foreach t in array new_tables loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at '
      'before update on public.%I '
      'for each row execute function public.set_updated_at();',
      t
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Seed built-in prompt templates (idempotent — uses ON CONFLICT).
-- -----------------------------------------------------------------------------
insert into public.prompt_templates (user_id, title, description, category, content, variables, is_public, sort_order)
values
  (null, 'Code Reviewer', 'Review code for bugs, security, and best practices.', 'coding',
   'You are an expert code reviewer. Review the following code for:\n1. Bugs and potential errors\n2. Security vulnerabilities\n3. Performance issues\n4. Best practices and readability\n\nProvide specific, actionable feedback with code examples where appropriate.\n\n```\n{{code}}\n```',
   '[{"name":"code","description":"The code to review","defaultValue":""}]'::jsonb,
   true, 1),
  (null, 'Writing Assistant', 'Improve clarity, grammar, and style of your writing.', 'writing',
   'You are a skilled writing assistant. Improve the following text for clarity, grammar, and style while preserving the original meaning and tone.\n\nText to improve:\n{{text}}\n\nProvide the revised version followed by a brief explanation of the key changes.',
   '[{"name":"text","description":"The text to improve","defaultValue":""}]'::jsonb,
   true, 2),
  (null, 'Data Analyst', 'Analyze data and provide insights.', 'analysis',
   'You are a data analyst. Analyze the following data and provide:\n1. Key summary statistics\n2. Notable patterns and trends\n3. Anomalies or outliers\n4. Actionable recommendations\n\nData:\n{{data}}\n\nFormat your response with clear headings and use tables where appropriate.',
   '[{"name":"data","description":"The data to analyze","defaultValue":""}]'::jsonb,
   true, 3),
  (null, 'Brainstorming Partner', 'Generate creative ideas and solutions.', 'creative',
   'You are a creative brainstorming partner. Help me generate ideas for:\n\nTopic: {{topic}}\n\nProvide 10 diverse, creative ideas. For each idea, include:\n- A catchy title\n- A one-sentence description\n- Why it could work\n\nThink outside the box and vary the scale and ambition of the ideas.',
   '[{"name":"topic","description":"The topic to brainstorm about","defaultValue":""}]'::jsonb,
   true, 4),
  (null, 'Meeting Summarizer', 'Summarize meeting notes into action items.', 'business',
   'You are a meeting summarizer. Analyze the following meeting notes and produce:\n\n## Summary\nA 2-3 sentence overview of what was discussed.\n\n## Key Decisions\nBullet list of decisions made.\n\n## Action Items\nTable with columns: Task | Owner | Due Date (if mentioned)\n\n## Open Questions\nUnresolved items that need follow-up.\n\nMeeting notes:\n{{notes}}',
   '[{"name":"notes","description":"The meeting notes to summarize","defaultValue":""}]'::jsonb,
   true, 5),
  (null, 'SQL Generator', 'Generate SQL queries from natural language.', 'coding',
   'You are a SQL expert. Given a database schema and a natural language request, generate a correct, optimized SQL query.\n\nSchema:\n{{schema}}\n\nRequest: {{request}}\n\nProvide only the SQL query in a code block, followed by a brief explanation of the approach.',
   '[{"name":"schema","description":"The database schema (DDL)","defaultValue":""},{"name":"request","description":"The natural language query request","defaultValue":""}]'::jsonb,
   true, 6)
on conflict (user_id, title) do update set
  description = excluded.description,
  category = excluded.category,
  content = excluded.content,
  variables = excluded.variables,
  is_public = true,
  sort_order = excluded.sort_order;
