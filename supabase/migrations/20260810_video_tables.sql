-- Phase 5: AI Video Generation Engine tables
-- All tables include RLS, indexes, foreign keys, and auto timestamps.

-- ─── Enums ───────────────────────────────────────────────

do $$ begin
  create type video_generation_status as enum (
    'queued', 'processing', 'completed', 'failed', 'cancelled'
  );

  create type video_generation_type as enum (
    'text-to-video',
    'image-to-video',
    'video-to-video',
    'video-extension',
    'style-transfer',
    'video-enhancement',
    'video-upscaling',
    'frame-interpolation'
  );

  create type video_edit_operation as enum (
    'trim', 'merge', 'split', 'resize', 'crop',
    'background-replacement', 'caption-generation',
    'subtitle-generation', 'audio-replacement',
    'video-enhancement', 'noise-reduction',
    'frame-interpolation', 'ai-upscaling'
  );

  create type video_job_status as enum (
    'queued', 'processing', 'completed', 'failed', 'cancelled'
  );
end $$;

-- ─── video_models ────────────────────────────────────────

create table video_models (
  id uuid primary key default gen_random_uuid(),
  model_id text not null,
  provider text not null,
  display_name text not null,
  description text default '',
  supported_resolutions text[] not null default '{}',
  supported_aspect_ratios text[] not null default '{}',
  supported_generation_types text[] not null default '{}',
  max_duration_seconds integer not null default 10,
  max_fps integer not null default 24,
  credit_cost integer not null default 10,
  quality text not null default 'medium' check (quality in ('low','medium','high','ultra')),
  speed text not null default 'medium' check (speed in ('slow','medium','fast')),
  supports_negative_prompt boolean not null default false,
  supports_seed boolean not null default false,
  supports_motion_strength boolean not null default false,
  supports_camera_movement boolean not null default false,
  supports_style_preset boolean not null default false,
  supports_creativity boolean not null default false,
  supports_image_input boolean not null default false,
  supports_video_input boolean not null default false,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_id, provider)
);

-- ─── video_generations ──────────────────────────────────

create table video_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  negative_prompt text not null default '',
  provider text not null,
  model text not null,
  status video_generation_status not null default 'queued',
  generation_type video_generation_type not null default 'text-to-video',
  settings jsonb not null default '{}',
  source_image_path text,
  source_video_path text,
  video_url text,
  video_storage_path text,
  thumbnail_url text,
  thumbnail_storage_path text,
  preview_gif_url text,
  preview_gif_storage_path text,
  duration_seconds real,
  resolution text,
  fps integer,
  aspect_ratio text,
  credits_used integer not null default 0,
  generation_time_ms integer,
  error_message text,
  is_favorite boolean not null default false,
  job_id uuid references video_jobs(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ─── video_jobs ─────────────────────────────────────────

create table video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references video_generations(id),
  provider text not null,
  model text not null,
  status video_job_status not null default 'queued',
  provider_job_id text,
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  attempt integer not null default 1,
  max_attempts integer not null default 3,
  error_message text,
  metadata jsonb not null default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── video_uploads ───────────────────────────────────────

create table video_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  storage_path text not null,
  width integer,
  height integer,
  duration_seconds real,
  fps integer,
  status text not null default 'pending' check (status in ('pending','processed','failed')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── video_usage ────────────────────────────────────────

create table video_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references video_generations(id),
  provider text not null,
  model text not null,
  operation text not null default 'generate',
  credits_used integer not null default 0,
  credits_refunded integer not null default 0,
  processing_ms integer,
  status text not null default 'success' check (status in ('success','failed','cancelled','refunded')),
  error_message text,
  created_at timestamptz not null default now()
);

-- ─── Storage bucket ──────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-uploads',
  'video-uploads',
  false,
  524288000, -- 500 MB
  array[
    'video/mp4', 'video/webm', 'video/quicktime',
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp'
  ]
)
on conflict (id) do nothing;

-- ─── Indexes ─────────────────────────────────────────────

create index idx_video_generations_user_id on video_generations(user_id);
create index idx_video_generations_status on video_generations(status);
create index idx_video_generations_created_at on video_generations(created_at desc);
create index idx_video_generations_user_status on video_generations(user_id, status);
create index idx_video_generations_favorite on video_generations(user_id, is_favorite) where is_favorite = true;

create index idx_video_jobs_user_id on video_jobs(user_id);
create index idx_video_jobs_status on video_jobs(status);
create index idx_video_jobs_provider_job_id on video_jobs(provider_job_id) where provider_job_id is not null;

create index idx_video_uploads_user_id on video_uploads(user_id);

create index idx_video_usage_user_id on video_usage(user_id);
create index idx_video_usage_created_at on video_usage(created_at desc);

-- ─── RLS ─────────────────────────────────────────────────

alter table video_models enable row level security;
alter table video_generations enable row level security;
alter table video_jobs enable row level security;
alter table video_uploads enable row level security;
alter table video_usage enable row level security;

-- video_models: readable by all authenticated users
create policy "Video models are readable by authenticated users"
  on video_models for select
  to authenticated
  using (true);

-- video_generations: users can only see their own
create policy "Users can view own video generations"
  on video_generations for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own video generations"
  on video_generations for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own video generations"
  on video_generations for update
  to authenticated
  using (user_id = auth.uid());

create policy "Users can delete own video generations"
  on video_generations for delete
  to authenticated
  using (user_id = auth.uid());

-- video_jobs: users can only see their own
create policy "Users can view own video jobs"
  on video_jobs for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own video jobs"
  on video_jobs for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own video jobs"
  on video_jobs for update
  to authenticated
  using (user_id = auth.uid());

-- video_uploads: users can only see their own
create policy "Users can view own video uploads"
  on video_uploads for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own video uploads"
  on video_uploads for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own video uploads"
  on video_uploads for update
  to authenticated
  using (user_id = auth.uid());

create policy "Users can delete own video uploads"
  on video_uploads for delete
  to authenticated
  using (user_id = auth.uid());

-- video_usage: users can only see their own
create policy "Users can view own video usage"
  on video_usage for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own video usage"
  on video_usage for insert
  to authenticated
  with check (user_id = auth.uid());

-- ─── Updated_at trigger (reuse existing if available) ─────

do $$ begin
  create or replace function update_updated_at_column()
  returns trigger as $$
  begin
    new.updated_at = now();
    return new;
  end;
  $$ language plpgsql;
end $$;

create trigger video_models_updated_at
  before update on video_models
  for each row execute procedure update_updated_at_column();

create trigger video_jobs_updated_at
  before update on video_jobs
  for each row execute procedure update_updated_at_column();

create trigger video_uploads_updated_at
  before update on video_uploads
  for each row execute procedure update_updated_at_column();

-- ─── Storage folder policies ─────────────────────────────

-- Users can only access their own folder in video-uploads bucket
create policy "Users can upload videos to own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'video-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own video files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'video-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own video files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'video-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Add video activity actions ───────────────────────────

alter type activity_action add value if not exists 'video_generated';
alter type activity_action add value if not exists 'video_upload';
