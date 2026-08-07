-- =============================================================================
-- SUPA AI — 0007_phase5_video.sql
-- Phase 5: AI Video Generation Platform.
--
-- Adds five tables for the video surface:
--   • video_generations — one row per generate request (prompt → result_url).
--   • video_models      — catalog of provider/model entries (max duration,
--                         supported resolutions, supported types).
--   • video_uploads     — user-uploaded source videos for image-to-video /
--                         video-to-video flows.
--   • video_jobs        — background-job records (async generation status,
--                         progress, external_job_id).
--   • video_usage       — per-day aggregation row keyed on
--                         (workspace_id, user_id, metric_date).
--
-- Design principles (carried from 0001 + 0005):
--   • Idempotent — every statement is safe to re-run.
--   • RLS on every new table. Default-deny. No `USING (true)` open policies.
--   • Money is integer cents (credits_consumed). Timestamps are timestamptz.
--   • updated_at maintained by the shared set_updated_at() trigger from 0003.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. video_generations
-- -----------------------------------------------------------------------------
create table if not exists public.video_generations (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null,
  user_id               uuid not null references auth.users (id) on delete cascade,
  provider              text not null,                          -- 'runway'|'kling'|'luma'|'pika'|'replicate'|'fal'|'google'|'openai'
  model                 text not null,                          -- provider model id
  prompt                text not null,
  type                  text not null default 'text-to-video'
                        check (type in ('text-to-video', 'image-to-video', 'video-to-video')),
  source_image_url      text,
  source_video_url      text,
  duration              integer,                               -- requested seconds
  fps                   integer,                               -- requested frames per second
  resolution            text,                                  -- e.g. '720p', '1080p'
  aspect_ratio          text,                                  -- e.g. '16:9', '9:16', '1:1'
  status                text not null default 'pending'
                        check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  result_url            text,
  result_storage_path   text,
  error                 text,
  credits_consumed      integer not null default 0,
  metadata              jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.video_generations enable row level security;

-- Owner can read/update/delete their own generations. Insert is gated by the
-- service layer (the API passes user_id from the session).
drop policy if exists "video_generations_select_owner" on public.video_generations;
create policy "video_generations_select_owner"
  on public.video_generations for select
  using (user_id = auth.uid());

drop policy if exists "video_generations_insert_self" on public.video_generations;
create policy "video_generations_insert_self"
  on public.video_generations for insert
  with check (user_id = auth.uid());

drop policy if exists "video_generations_update_owner" on public.video_generations;
create policy "video_generations_update_owner"
  on public.video_generations for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "video_generations_delete_owner" on public.video_generations;
create policy "video_generations_delete_owner"
  on public.video_generations for delete
  using (user_id = auth.uid());

-- Indexes.
drop index if exists video_generations_user_created_idx;
create index if not exists video_generations_user_created_idx
  on public.video_generations (user_id, created_at desc);

drop index if exists video_generations_workspace_created_idx;
create index if not exists video_generations_workspace_created_idx
  on public.video_generations (workspace_id, created_at desc);

drop index if exists video_generations_status_idx;
create index if not exists video_generations_status_idx
  on public.video_generations (status)
  where status in ('pending', 'processing');

drop index if exists video_generations_provider_idx;
create index if not exists video_generations_provider_idx
  on public.video_generations (provider, model);

-- -----------------------------------------------------------------------------
-- 2. video_models — provider/model catalog
-- -----------------------------------------------------------------------------
create table if not exists public.video_models (
  id                    uuid primary key default gen_random_uuid(),
  provider              text not null,
  model_id              text not null,                          -- e.g. 'gen-3-alpha'
  name                  text not null,                          -- human-friendly label
  description           text,
  max_duration          integer,                                -- seconds
  supported_resolutions text[] not null default '{}',
  supported_types       text[] not null default '{}',           -- subset of {text-to-video,image-to-video,video-to-video}
  is_active             boolean not null default true,
  sort_order            integer not null default 0,
  metadata              jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (provider, model_id)
);

alter table public.video_models enable row level security;

-- System catalog: readable by authenticated users; no client inserts/updates.
drop policy if exists "video_models_select_authenticated" on public.video_models;
create policy "video_models_select_authenticated"
  on public.video_models for select
  using (auth.uid() is not null);

drop index if exists video_models_active_idx;
create index if not exists video_models_active_idx
  on public.video_models (is_active, sort_order);

drop index if exists video_models_provider_idx;
create index if not exists video_models_provider_idx
  on public.video_models (provider, is_active);

-- Seed a small catalog so the UI has something to show even before an admin
-- wires up real provider keys. ON CONFLICT keeps this idempotent.
insert into public.video_models (provider, model_id, name, description, max_duration, supported_resolutions, supported_types, is_active, sort_order)
values
  ('runway',   'gen-3-alpha',    'Runway Gen-3 Alpha',    'Cinematic text-to-video and image-to-video model from Runway.', 10, array['720p','1080p'], array['text-to-video','image-to-video'], true, 1),
  ('runway',   'gen-3-turbo',    'Runway Gen-3 Turbo',     'Faster, lighter-weight Runway model for quick iterations.',     10, array['720p'],          array['text-to-video','image-to-video'], true, 2),
  ('kling',    'kling-v1',       'Kling v1',              'Kuaishou Kling v1 — long-form text-to-video.',                  12, array['720p','1080p'], array['text-to-video','image-to-video'], true, 3),
  ('luma',     'dream-machine',  'Luma Dream Machine',    'Luma Labs Dream Machine — high-fidelity motion.',              5,  array['720p','1080p'], array['text-to-video','image-to-video'], true, 4),
  ('pika',     'pika-1.5',       'Pika 1.5',              'Pika 1.5 — playful, creative text-to-video.',                  8,  array['720p'],          array['text-to-video','image-to-video'], true, 5),
  ('replicate','wan-2.1',        'Replicate Wan 2.1',     'Wan 2.1 hosted on Replicate — open video model.',              6,  array['720p','1080p'], array['text-to-video','image-to-video'], true, 6),
  ('fal',      'minimax-video',  'Fal MiniMax Video',     'MiniMax video model served via fal.ai.',                       6,  array['720p','1080p'], array['text-to-video','image-to-video'], true, 7),
  ('google',   'veo-3',          'Google Veo 3',          'Google DeepMind Veo 3 — high-quality cinematic generation.',    8,  array['720p','1080p'], array['text-to-video','image-to-video'], true, 8),
  ('openai',   'sora-2',         'OpenAI Sora 2',         'OpenAI Sora 2 — long-form, high-resolution video.',            12, array['720p','1080p','4k'], array['text-to-video','image-to-video','video-to-video'], true, 9)
on conflict (provider, model_id) do update set
  name                 = excluded.name,
  description          = excluded.description,
  max_duration         = excluded.max_duration,
  supported_resolutions = excluded.supported_resolutions,
  supported_types      = excluded.supported_types,
  is_active            = excluded.is_active,
  sort_order           = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- 3. video_uploads — user-uploaded source videos
-- -----------------------------------------------------------------------------
create table if not exists public.video_uploads (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  user_id       uuid not null references auth.users (id) on delete cascade,
  file_name     text not null,
  file_path     text not null,                                -- storage path in 'ai-assets' bucket
  file_size     bigint not null,
  mime_type     text not null,
  duration      numeric,                                      -- seconds (extracted client-side)
  width         integer,
  height        integer,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

alter table public.video_uploads enable row level security;

drop policy if exists "video_uploads_select_owner" on public.video_uploads;
create policy "video_uploads_select_owner"
  on public.video_uploads for select
  using (user_id = auth.uid());

drop policy if exists "video_uploads_insert_self" on public.video_uploads;
create policy "video_uploads_insert_self"
  on public.video_uploads for insert
  with check (user_id = auth.uid());

drop policy if exists "video_uploads_delete_owner" on public.video_uploads;
create policy "video_uploads_delete_owner"
  on public.video_uploads for delete
  using (user_id = auth.uid());

drop index if exists video_uploads_user_created_idx;
create index if not exists video_uploads_user_created_idx
  on public.video_uploads (user_id, created_at desc);

drop index if exists video_uploads_workspace_idx;
create index if not exists video_uploads_workspace_idx
  on public.video_uploads (workspace_id);

-- -----------------------------------------------------------------------------
-- 4. video_jobs — background job records for async generation
-- -----------------------------------------------------------------------------
create table if not exists public.video_jobs (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null,
  generation_id     uuid not null references public.video_generations (id) on delete cascade,
  provider          text not null,
  external_job_id   text,                                    -- provider-side job identifier
  status            text not null default 'pending'
                    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  progress          integer not null default 0,              -- 0..100
  result_url        text,
  error             text,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.video_jobs enable row level security;

-- Visibility mirrors the owning generation (ownership is enforced via the
-- join on generation_id → video_generations.user_id = auth.uid()).
drop policy if exists "video_jobs_select_owner" on public.video_jobs;
create policy "video_jobs_select_owner"
  on public.video_jobs for select
  using (
    exists (
      select 1 from public.video_generations g
      where g.id = video_jobs.generation_id
        and g.user_id = auth.uid()
    )
  );

drop policy if exists "video_jobs_insert_self" on public.video_jobs;
create policy "video_jobs_insert_self"
  on public.video_jobs for insert
  with check (
    exists (
      select 1 from public.video_generations g
      where g.id = video_jobs.generation_id
        and g.user_id = auth.uid()
    )
  );

drop policy if exists "video_jobs_update_owner" on public.video_jobs;
create policy "video_jobs_update_owner"
  on public.video_jobs for update
  using (
    exists (
      select 1 from public.video_generations g
      where g.id = video_jobs.generation_id
        and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.video_generations g
      where g.id = video_jobs.generation_id
        and g.user_id = auth.uid()
    )
  );

drop index if exists video_jobs_generation_idx;
create index if not exists video_jobs_generation_idx
  on public.video_jobs (generation_id);

drop index if exists video_jobs_status_idx;
create index if not exists video_jobs_status_idx
  on public.video_jobs (status, updated_at desc);

drop index if exists video_jobs_workspace_idx;
create index if not exists video_jobs_workspace_idx
  on public.video_jobs (workspace_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 5. video_usage — per-day rollup
-- -----------------------------------------------------------------------------
create table if not exists public.video_usage (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null,
  user_id           uuid not null references auth.users (id) on delete cascade,
  metric_date       date not null default current_date,
  videos_generated  integer not null default 0,
  credits_used      integer not null default 0,
  by_provider       jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (workspace_id, user_id, metric_date)
);

alter table public.video_usage enable row level security;

drop policy if exists "video_usage_select_owner" on public.video_usage;
create policy "video_usage_select_owner"
  on public.video_usage for select
  using (user_id = auth.uid());

drop policy if exists "video_usage_insert_self" on public.video_usage;
create policy "video_usage_insert_self"
  on public.video_usage for insert
  with check (user_id = auth.uid());

drop policy if exists "video_usage_update_owner" on public.video_usage;
create policy "video_usage_update_owner"
  on public.video_usage for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop index if exists video_usage_user_date_idx;
create index if not exists video_usage_user_date_idx
  on public.video_usage (user_id, metric_date desc);

drop index if exists video_usage_workspace_date_idx;
create index if not exists video_usage_workspace_date_idx
  on public.video_usage (workspace_id, metric_date desc);

-- -----------------------------------------------------------------------------
-- 6. updated_at triggers for the new tables that carry an updated_at column.
--    video_uploads + video_usage have no updated_at — skipped intentionally.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  new_tables text[] := array['video_generations', 'video_models', 'video_jobs'];
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
