-- =============================================================================
-- SUPA AI — 0006_phase4_images.sql
-- Phase 4: AI Image Generation.
--
-- Adds 5 tables for the image generation surface:
--   • image_generations — one row per generate call (prompt, provider, model,
--     status, result URL, credits consumed, error).
--   • image_models      — system catalog of available image models per
--     provider (OpenAI DALL-E, Stability, Replicate, Fal, Ideogram, Google).
--   • image_styles      — preset styles (photographic, anime, 3d, …) the
--     picker offers; seeded with a curated set.
--   • image_uploads     — user-uploaded source images for enhance/upscale/
--     remove-background workflows.
--   • image_usage       — per-day per-user rollup (images_generated,
--     credits_used, by_provider jsonb).
--
-- Design principles (carried from 0001 / 0005):
--   • Idempotent — every statement is safe to re-run.
--   • RLS on every new table. Default-deny. Workspace members can read/write
--     their workspace's images.
--   • Money is integer cents. Timestamps are timestamptz.
--   • updated_at triggers reuse the existing `public.set_updated_at()`
--     function from 0001_init.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. image_generations
-- -----------------------------------------------------------------------------
create table if not exists public.image_generations (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid,                            -- Phase 9A workspace; null until that table ships
  user_id               uuid not null references auth.users (id) on delete cascade,
  provider              text not null,                   -- 'openai'|'stability'|'replicate'|'fal'|'ideogram'|'google'
  model                 text not null,                   -- e.g. 'dall-e-3'
  prompt                text not null,
  negative_prompt       text,
  style                 text,                            -- preset key from image_styles
  size                  text,                            -- '1024x1024' | '1792x1024' | …
  quality               text,                            -- 'standard'|'hd'
  status                text not null default 'pending'
                          check (status in ('pending','processing','succeeded','failed','cancelled')),
  result_url            text,                            -- public/signed URL for the final image
  result_storage_path   text,                            -- ai-assets bucket path when persisted
  error                 text,
  credits_consumed      integer not null default 0,
  metadata              jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.image_generations enable row level security;

drop index if exists image_generations_user_created_idx;
create index if not exists image_generations_user_created_idx
  on public.image_generations (user_id, created_at desc);

drop index if exists image_generations_workspace_created_idx;
create index if not exists image_generations_workspace_created_idx
  on public.image_generations (workspace_id, created_at desc)
  where workspace_id is not null;

drop index if exists image_generations_status_idx;
create index if not exists image_generations_status_idx
  on public.image_generations (status, created_at desc);

drop index if exists image_generations_provider_idx;
create index if not exists image_generations_provider_idx
  on public.image_generations (provider, created_at desc);

-- Owner can read + delete; owner can insert (RLS confirms user_id matches).
drop policy if exists "image_generations_select_owner_or_workspace" on public.image_generations;
create policy "image_generations_select_owner_or_workspace"
  on public.image_generations for select
  using (
    user_id = auth.uid()
    or (workspace_id is not null and exists (
      select 1 from public.organization_members om
      where om.org_id = image_generations.workspace_id and om.user_id = auth.uid()
    ))
  );

drop policy if exists "image_generations_insert_self" on public.image_generations;
create policy "image_generations_insert_self"
  on public.image_generations for insert
  with check (user_id = auth.uid());

drop policy if exists "image_generations_update_self" on public.image_generations;
create policy "image_generations_update_self"
  on public.image_generations for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "image_generations_delete_self" on public.image_generations;
create policy "image_generations_delete_self"
  on public.image_generations for delete
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 2. image_models — system catalog of available image models
-- -----------------------------------------------------------------------------
create table if not exists public.image_models (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null,
  model_id            text not null,                   -- e.g. 'dall-e-3'
  name                text not null,                   -- human-friendly label
  description         text,
  max_size            text,                            -- '1792x1024'
  supported_styles    text[],                          -- ['photographic','anime',…]
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, model_id)
);

alter table public.image_models enable row level security;

drop index if exists image_models_active_idx;
create index if not exists image_models_active_idx
  on public.image_models (is_active, provider);

-- System catalog: readable by all authenticated users; writable by
-- service-role only (admin).
drop policy if exists "image_models_select_authenticated" on public.image_models;
create policy "image_models_select_authenticated"
  on public.image_models for select
  using (auth.uid() is not null);

-- -----------------------------------------------------------------------------
-- 3. image_styles — preset style catalog
-- -----------------------------------------------------------------------------
create table if not exists public.image_styles (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,                  -- 'photographic' | 'anime' | …
  name          text not null,
  description   text,
  category      text not null default 'general',       -- 'general'|'artistic'|'photographic'|'digital'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.image_styles enable row level security;

drop index if exists image_styles_category_idx;
create index if not exists image_styles_category_idx
  on public.image_styles (category, key);

drop policy if exists "image_styles_select_authenticated" on public.image_styles;
create policy "image_styles_select_authenticated"
  on public.image_styles for select
  using (auth.uid() is not null);

-- -----------------------------------------------------------------------------
-- 4. image_uploads — user-uploaded source images for enhance/upscale/rbg
-- -----------------------------------------------------------------------------
create table if not exists public.image_uploads (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid,
  user_id       uuid not null references auth.users (id) on delete cascade,
  file_name     text not null,
  file_path     text not null,                          -- storage path under the ai-assets bucket
  file_size     integer not null,
  mime_type     text not null,
  width         integer,
  height        integer,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

alter table public.image_uploads enable row level security;

drop index if exists image_uploads_user_created_idx;
create index if not exists image_uploads_user_created_idx
  on public.image_uploads (user_id, created_at desc);

drop index if exists image_uploads_workspace_idx;
create index if not exists image_uploads_workspace_idx
  on public.image_uploads (workspace_id, created_at desc)
  where workspace_id is not null;

drop policy if exists "image_uploads_select_owner_or_workspace" on public.image_uploads;
create policy "image_uploads_select_owner_or_workspace"
  on public.image_uploads for select
  using (
    user_id = auth.uid()
    or (workspace_id is not null and exists (
      select 1 from public.organization_members om
      where om.org_id = image_uploads.workspace_id and om.user_id = auth.uid()
    ))
  );

drop policy if exists "image_uploads_insert_self" on public.image_uploads;
create policy "image_uploads_insert_self"
  on public.image_uploads for insert
  with check (user_id = auth.uid());

drop policy if exists "image_uploads_delete_self" on public.image_uploads;
create policy "image_uploads_delete_self"
  on public.image_uploads for delete
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. image_usage — per-day per-user rollup
-- -----------------------------------------------------------------------------
create table if not exists public.image_usage (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid,
  user_id             uuid not null references auth.users (id) on delete cascade,
  metric_date         date not null,
  images_generated    integer not null default 0,
  credits_used        integer not null default 0,
  by_provider         jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (workspace_id, user_id, metric_date)
);

alter table public.image_usage enable row level security;

drop index if exists image_usage_user_date_idx;
create index if not exists image_usage_user_date_idx
  on public.image_usage (user_id, metric_date desc);

drop index if exists image_usage_workspace_date_idx;
create index if exists image_usage_workspace_date_idx
  on public.image_usage (workspace_id, metric_date desc)
  where workspace_id is not null;

drop policy if exists "image_usage_select_owner_or_workspace" on public.image_usage;
create policy "image_usage_select_owner_or_workspace"
  on public.image_usage for select
  using (
    user_id = auth.uid()
    or (workspace_id is not null and exists (
      select 1 from public.organization_members om
      where om.org_id = image_usage.workspace_id and om.user_id = auth.uid()
    ))
  );

drop policy if exists "image_usage_insert_self" on public.image_usage;
create policy "image_usage_insert_self"
  on public.image_usage for insert
  with check (user_id = auth.uid());

drop policy if exists "image_usage_update_self" on public.image_usage;
create policy "image_usage_update_self"
  on public.image_usage for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 6. updated_at triggers for the new tables.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  new_tables text[] := array['image_generations', 'image_models', 'image_styles', 'image_usage'];
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
-- 7. Seed image_styles (curated preset list).
-- -----------------------------------------------------------------------------
insert into public.image_styles (key, name, description, category)
values
  ('photographic',  'Photographic',  'Realistic photo with natural lighting and depth of field.', 'photographic'),
  ('cinematic',     'Cinematic',    'Film-still framing with dramatic lighting and color grading.', 'photographic'),
  ('anime',         'Anime',        'Japanese animation aesthetic with bold outlines and flat colors.', 'artistic'),
  ('digital-art',   'Digital Art',  'Painterly digital illustration with rich textures.', 'artistic'),
  ('concept-art',   'Concept Art',  'Production design sketch for games or film.', 'artistic'),
  ('fantasy',       'Fantasy',      'Surreal otherworldly scene with magical elements.', 'artistic'),
  ('3d-render',     '3D Render',     'Photorealistic CGI with global illumination.', 'digital'),
  ('pixel-art',     'Pixel Art',    '8/16-bit retro pixel aesthetic.', 'digital'),
  ('low-poly',      'Low Poly',     'Faceted geometric shapes with flat shading.', 'digital'),
  ('watercolor',    'Watercolor',    'Soft watercolor washes and bleeding pigments.', 'artistic'),
  ('oil-painting',  'Oil Painting', 'Heavy brush strokes and rich impasto.', 'artistic'),
  ('minimalist',    'Minimalist',    'Clean composition with generous negative space.', 'general'),
  ('neon',          'Neon',         'Vibrant cyberpunk glow with deep contrast.', 'digital'),
  ('claymation',    'Claymation',   'Stop-motion clay figure aesthetic.', 'artistic')
on conflict (key) do update set
  name        = excluded.name,
  description = excluded.description,
  category    = excluded.category;

-- -----------------------------------------------------------------------------
-- 8. Seed image_models (system catalog of supported models per provider).
-- -----------------------------------------------------------------------------
insert into public.image_models (provider, model_id, name, description, max_size, supported_styles, is_active)
values
  ('openai',    'dall-e-3',       'DALL·E 3',       'OpenAI DALL·E 3 — high-fidelity text-to-image.',           '1792x1024', null, true),
  ('openai',    'dall-e-2',       'DALL·E 2',       'OpenAI DALL·E 2 — lower cost, edit-friendly.',            '1024x1024', null, true),
  ('stability', 'stable-diffusion-3',  'Stable Diffusion 3',  'Stability AI SD3 — strong prompt adherence.',     '1024x1024', null, true),
  ('stability', 'stable-diffusion-xl', 'Stable Diffusion XL', 'Stability AI SDXL — versatile open model.',       '1024x1024', null, true),
  ('replicate', 'flux-dev',       'FLUX.1 [dev]',   'Replicate-hosted FLUX.1 dev model.',                     '1024x1024', null, true),
  ('replicate', 'flux-schnell',   'FLUX.1 [schnell]','Replicate-hosted FLUX.1 schnell (fast).',              '1024x1024', null, true),
  ('fal',       'flux-dev',       'FLUX.1 [dev] (fal)', 'Fal.ai-hosted FLUX.1 dev — optimized latency.',       '1024x1024', null, true),
  ('fal',       'sdxl',           'SDXL (fal)',     'Fal.ai-hosted Stable Diffusion XL.',                     '1024x1024', null, true),
  ('ideogram',  'ideogram-v2',    'Ideogram v2',    'Ideogram v2 — best-in-class typography.',                '1024x1024', null, true),
  ('google',    'imagen-3',       'Imagen 3',       'Google Imagen 3 — photorealistic generations.',          '1024x1024', null, true)
on conflict (provider, model_id) do update set
  name        = excluded.name,
  description = excluded.description,
  max_size    = excluded.max_size,
  is_active   = excluded.is_active;
