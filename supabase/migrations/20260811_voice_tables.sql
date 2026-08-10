-- Phase 6: AI Voice & Audio Platform
-- All tables, enums, indexes, RLS policies, and storage buckets.

-- ─── Enums ────────────────────────────────────────────────

do $$ begin
  create type voice_generation_status as enum (
    'queued','processing','completed','failed','cancelled'
  );
  create type voice_operation_type as enum (
    'tts','stt','sts','clone','translate','dubbing','enhance','noise_remove','diarize','trim','merge','split','normalize','volume_adjust','fade','background_mix'
  );
  create type voice_job_status as enum (
    'queued','processing','completed','failed','cancelled'
  );
  create type audio_format as enum (
    'mp3','wav','ogg','flac','aac','m4a','webm'
  );
exception when duplicate_object then null;
end $$;

-- Extend activity_action if not already present
do $$ begin
  alter type activity_action add value if not exists 'voice_generated';
  alter type activity_action add value if not exists 'audio_uploaded';
exception when others then null;
end $$;

-- ─── Tables ───────────────────────────────────────────────

-- Voice model registry
create table if not exists voice_models (
  id uuid primary key default gen_random_uuid(),
  model_id text not null unique,
  provider text not null,
  display_name text not null,
  description text,
  supported_languages text[] not null default '{}',
  voice_type text not null default 'neural',
  gender text,
  character_limit integer not null default 5000,
  credit_cost integer not null default 5,
  latency_ms integer not null default 500,
  supports_tts boolean not null default true,
  supports_stt boolean not null default false,
  supports_sts boolean not null default false,
  supports_cloning boolean not null default false,
  supports_translation boolean not null default false,
  supports_dubbing boolean not null default false,
  supports_emotion boolean not null default false,
  supports_diarization boolean not null default false,
  supported_formats text[] not null default '{mp3,wav,ogg}',
  supported_sample_rates integer[] not null default '{22050,24000,44100,48000}',
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Voice generations (TTS, STT, STS, translation, dubbing, etc.)
create table if not exists voice_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_type voice_operation_type not null,
  provider text not null,
  model text not null,
  status voice_generation_status not null default 'queued',
  input_text text,
  input_language text,
  output_language text,
  voice_id text,
  voice_profile_id uuid references voice_profiles(id) on delete set null,
  source_audio_path text,
  output_audio_path text,
  output_format audio_format not null default 'mp3',
  sample_rate integer,
  duration_seconds real,
  file_size_bytes bigint,
  transcript_text text,
  transcript_data jsonb,
  subtitles_path text,
  translation_text text,
  settings jsonb not null default '{}',
  error_message text,
  credits_used integer not null default 0,
  processing_ms integer,
  is_favorite boolean not null default false,
  job_id uuid references voice_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Background jobs for long-running voice operations
create table if not exists voice_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references voice_generations(id) on delete set null,
  provider text not null,
  model text not null,
  status voice_job_status not null default 'queued',
  provider_job_id text,
  progress_percent integer not null default 0,
  attempt integer not null default 1,
  max_attempts integer not null default 3,
  error_message text,
  metadata jsonb not null default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Voice profiles for cloning
create table if not exists voice_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  provider text not null,
  provider_voice_id text,
  sample_storage_path text,
  preview_storage_path text,
  language text,
  gender text,
  is_verified boolean not null default false,
  consent_given boolean not null default false,
  consent_given_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Transcripts
create table if not exists voice_transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references voice_generations(id) on delete set null,
  audio_storage_path text,
  language text,
  confidence real,
  transcript_text text not null,
  speaker_labels jsonb,
  chapters jsonb,
  timestamps jsonb,
  word_count integer,
  duration_seconds real,
  created_at timestamptz not null default now()
);

-- Usage tracking
create table if not exists voice_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references voice_generations(id) on delete set null,
  provider text not null,
  model text not null,
  operation voice_operation_type not null,
  credits_used integer not null default 0,
  credits_refunded integer not null default 0,
  input_characters integer,
  output_duration_seconds real,
  processing_ms integer,
  status text not null default 'success',
  error_message text,
  created_at timestamptz not null default now()
);

-- Audio uploads
create table if not exists audio_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  storage_path text not null,
  duration_seconds real,
  sample_rate integer,
  channels integer,
  status text not null default 'pending',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Indexes ───────────────────────────────────────────────

create index if not exists idx_voice_models_provider on voice_models(provider);
create index if not exists idx_voice_generations_user_id on voice_generations(user_id);
create index if not exists idx_voice_generations_status on voice_generations(status);
create index if not exists idx_voice_generations_created_at on voice_generations(created_at desc);
create index if not exists idx_voice_generations_user_fav on voice_generations(user_id) where is_favorite = true;
create index if not exists idx_voice_jobs_user_id on voice_jobs(user_id);
create index if not exists idx_voice_jobs_status on voice_jobs(status);
create index if not exists idx_voice_jobs_provider_job_id on voice_jobs(provider_job_id);
create index if not exists idx_voice_profiles_user_id on voice_profiles(user_id);
create index if not exists idx_voice_transcripts_user_id on voice_transcripts(user_id);
create index if not exists idx_voice_usage_user_id on voice_usage(user_id);
create index if not exists idx_audio_uploads_user_id on audio_uploads(user_id);

-- ─── RLS ───────────────────────────────────────────────────

alter table voice_models enable row level security;
alter table voice_generations enable row level security;
alter table voice_jobs enable row level security;
alter table voice_profiles enable row level security;
alter table voice_transcripts enable row level security;
alter table voice_usage enable row level security;
alter table audio_uploads enable row level security;

-- voice_models: readable by all authenticated users
create policy "Voice models readable" on voice_models for select to authenticated using (true);

-- voice_generations
create policy "Voice gens select own" on voice_generations for select to authenticated using (user_id = auth.uid());
create policy "Voice gens insert own" on voice_generations for insert to authenticated with check (user_id = auth.uid());
create policy "Voice gens update own" on voice_generations for update to authenticated using (user_id = auth.uid());
create policy "Voice gens delete own" on voice_generations for delete to authenticated using (user_id = auth.uid());

-- voice_jobs
create policy "Voice jobs select own" on voice_jobs for select to authenticated using (user_id = auth.uid());
create policy "Voice jobs insert own" on voice_jobs for insert to authenticated with check (user_id = auth.uid());
create policy "Voice jobs update own" on voice_jobs for update to authenticated using (user_id = auth.uid());

-- voice_profiles
create policy "Voice profiles select own" on voice_profiles for select to authenticated using (user_id = auth.uid());
create policy "Voice profiles insert own" on voice_profiles for insert to authenticated with check (user_id = auth.uid());
create policy "Voice profiles update own" on voice_profiles for update to authenticated using (user_id = auth.uid());
create policy "Voice profiles delete own" on voice_profiles for delete to authenticated using (user_id = auth.uid());

-- voice_transcripts
create policy "Voice transcripts select own" on voice_transcripts for select to authenticated using (user_id = auth.uid());
create policy "Voice transcripts insert own" on voice_transcripts for insert to authenticated with check (user_id = auth.uid());

-- voice_usage
create policy "Voice usage select own" on voice_usage for select to authenticated using (user_id = auth.uid());
create policy "Voice usage insert own" on voice_usage for insert to authenticated with check (user_id = auth.uid());

-- audio_uploads
create policy "Audio uploads select own" on audio_uploads for select to authenticated using (user_id = auth.uid());
create policy "Audio uploads insert own" on audio_uploads for insert to authenticated with check (user_id = auth.uid());
create policy "Audio uploads delete own" on audio_uploads for delete to authenticated using (user_id = auth.uid());

-- ─── Storage Bucket ────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio-uploads', 'audio-uploads', false, 524288000,
  array[
    'audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg',
    'audio/flac','audio/aac','audio/mp4','audio/x-m4a','audio/webm',
    'image/png','image/jpeg','image/jpg','image/webp'
  ]
)
on conflict (id) do nothing;

-- Storage folder policies
create policy "Audio uploads folder select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'audio-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Audio uploads folder insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audio-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Audio uploads folder delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audio-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── Triggers ──────────────────────────────────────────────

create or replace function update_voice_models_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create or replace function update_voice_profiles_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_voice_models_updated_at before update on voice_models
  for each row execute function update_voice_models_updated_at();

create trigger trg_voice_profiles_updated_at before update on voice_profiles
  for each row execute function update_voice_profiles_updated_at();
