-- =============================================================================
-- SUPA AI — 0008_phase6_voice.sql
-- Phase 6 / Phase 8: AI Voice Platform — TTS, STT, translate, dub, clone.
--
-- 7 tables, workspace-scoped with default-deny RLS. Mirrors the layout
-- established by 0014_phase9c_employees.sql (the `workspace_id` column
-- references `public.workspaces`; until that table lands in Phase 9A the
-- API layer passes the caller's `user_id` as a synthetic workspace id and
-- the service uses the admin client so RLS bypass is consistent with
-- Phase 9C).
--
-- Design principles (carried from 0001 / 0014):
--   • Idempotent — every statement is safe to re-run.
--   • RLS on every new table. Default-deny. No `USING (true)` open policies.
--   • Money is integer cents. Timestamps are timestamptz. Durations are
--     milliseconds (integer) where the source reports a precise value, or
--     seconds (integer) where the source only reports whole seconds.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. voice_generations — one row per TTS / STT / translate / dub / clone call.
--    The single source of truth for every voice operation in the platform.
-- -----------------------------------------------------------------------------
create table if not exists public.voice_generations (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid references public.workspaces (id) on delete cascade,
  user_id               uuid not null references auth.users (id) on delete cascade,
  provider              text not null,                 -- 'openai'|'elevenlabs'|'google'|'azure'|'deepgram'|'assemblyai'|'cartesia'|'playht'
  model                 text not null,                 -- provider's model identifier (e.g. 'tts-1', 'eleven-multilingual-v2')
  type                  text not null check (type in ('tts','stt','translate','dub','clone')),
  text                  text,                           -- input text (TTS/translate) or transcribed text (STT, populated post-run)
  voice_id              text,                           -- provider voice / speaker id
  language              text,                           -- BCP-47 tag (e.g. 'en-US')
  source_audio_url      text,                           -- source audio for STT / translate / dub / clone
  result_url            text,                           -- public/signed URL of the generated audio (TTS / dub)
  result_storage_path   text,                           -- `ai-assets/...` path inside Supabase Storage
  status                text not null default 'pending' check (status in ('pending','processing','completed','failed','cancelled')),
  error                 text,                           -- populated when status='failed'
  credits_consumed      integer not null default 0,
  duration              integer,                        -- output duration in milliseconds
  metadata              jsonb,                          -- provider-specific extras (sample_rate, format, etc.)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.voice_generations enable row level security;

create index if not exists voice_generations_workspace_idx
  on public.voice_generations (workspace_id, created_at desc);

create index if not exists voice_generations_user_idx
  on public.voice_generations (user_id, created_at desc);

create index if not exists voice_generations_status_idx
  on public.voice_generations (workspace_id, status);

create index if not exists voice_generations_type_idx
  on public.voice_generations (workspace_id, type);

-- Workspace members can read; only the creator (or any workspace member)
-- can insert/update/delete. Mirrors the Phase 9C policy shape.
drop policy if exists "voice_generations_ws_select" on public.voice_generations;
create policy "voice_generations_ws_select" on public.voice_generations for select
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "voice_generations_ws_insert" on public.voice_generations;
create policy "voice_generations_ws_insert" on public.voice_generations for insert
  with check (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()) and user_id = auth.uid());

drop policy if exists "voice_generations_ws_update" on public.voice_generations;
create policy "voice_generations_ws_update" on public.voice_generations for update
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "voice_generations_ws_delete" on public.voice_generations;
create policy "voice_generations_ws_delete" on public.voice_generations for delete
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. voice_models — provider model catalog (system-readable).
--    Operators can toggle models without a redeploy by updating this table.
--    Seed values are inserted below.
-- -----------------------------------------------------------------------------
create table if not exists public.voice_models (
  id                    uuid primary key default gen_random_uuid(),
  provider              text not null,
  model_id              text not null,                 -- provider's stable id
  name                  text not null,                 -- human-friendly label
  description           text,
  type                  text not null check (type in ('tts','stt')),
  supported_languages   text[] not null default '{}',  -- ['en-US','en-GB','fr-FR', ...]
  supported_voices      jsonb not null default '[]',   -- [{id,label,language,gender}]
  is_active             boolean not null default true,
  metadata              jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (provider, model_id)
);

alter table public.voice_models enable row level security;

create index if not exists voice_models_active_idx
  on public.voice_models (is_active, provider, type);

create index if not exists voice_models_provider_idx
  on public.voice_models (provider, model_id);

-- System catalog — readable by all authenticated users, writable by
-- service-role only.
drop policy if exists "voice_models_select_authenticated" on public.voice_models;
create policy "voice_models_select_authenticated" on public.voice_models for select
  using (auth.uid() is not null);

-- -----------------------------------------------------------------------------
-- 3. voice_profiles — saved voice configurations (provider + voice + settings)
--    scoped per workspace + user. Includes cloned voices.
-- -----------------------------------------------------------------------------
create table if not exists public.voice_profiles (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  user_id               uuid not null references auth.users (id) on delete cascade,
  name                  text not null,
  provider              text not null,
  voice_id              text not null,
  language              text,
  settings              jsonb not null default '{}',  -- {speed, pitch, stability, similarity_boost, ...}
  is_cloned             boolean not null default false,
  sample_audio_url      text,                           -- reference audio for cloned voices
  metadata              jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.voice_profiles enable row level security;

create index if not exists voice_profiles_workspace_idx
  on public.voice_profiles (workspace_id, created_at desc);

create index if not exists voice_profiles_user_idx
  on public.voice_profiles (user_id, created_at desc);

create index if not exists voice_profiles_cloned_idx
  on public.voice_profiles (workspace_id, is_cloned) where is_cloned = true;

drop policy if exists "voice_profiles_ws_select" on public.voice_profiles;
create policy "voice_profiles_ws_select" on public.voice_profiles for select
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "voice_profiles_ws_insert" on public.voice_profiles;
create policy "voice_profiles_ws_insert" on public.voice_profiles for insert
  with check (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()) and user_id = auth.uid());

drop policy if exists "voice_profiles_ws_update" on public.voice_profiles;
create policy "voice_profiles_ws_update" on public.voice_profiles for update
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "voice_profiles_ws_delete" on public.voice_profiles;
create policy "voice_profiles_ws_delete" on public.voice_profiles for delete
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 4. voice_transcripts — STT results with optional segment-level metadata.
-- -----------------------------------------------------------------------------
create table if not exists public.voice_transcripts (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  generation_id         uuid not null references public.voice_generations (id) on delete cascade,
  text                  text not null,
  language              text,
  confidence            real,                           -- 0..1 (null when the provider doesn't report it)
  segments              jsonb,                          -- [{start, end, text, speaker, confidence}]
  created_at            timestamptz not null default now()
);

alter table public.voice_transcripts enable row level security;

create index if not exists voice_transcripts_workspace_idx
  on public.voice_transcripts (workspace_id, created_at desc);

create index if not exists voice_transcripts_generation_idx
  on public.voice_transcripts (generation_id);

drop policy if exists "voice_transcripts_ws_select" on public.voice_transcripts;
create policy "voice_transcripts_ws_select" on public.voice_transcripts for select
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "voice_transcripts_ws_insert" on public.voice_transcripts;
create policy "voice_transcripts_ws_insert" on public.voice_transcripts for insert
  with check (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "voice_transcripts_ws_delete" on public.voice_transcripts;
create policy "voice_transcripts_ws_delete" on public.voice_transcripts for delete
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 5. audio_uploads — registry of audio files uploaded by users (STT inputs,
--    cloning samples, dubbing sources).
-- -----------------------------------------------------------------------------
create table if not exists public.audio_uploads (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  user_id               uuid not null references auth.users (id) on delete cascade,
  file_name             text not null,
  file_path             text not null,                 -- `ai-assets/...` storage path
  file_size             bigint not null,               -- bytes
  mime_type             text not null,
  duration              integer,                       -- milliseconds (null when unknown)
  metadata              jsonb,                         -- {sample_rate, channels, ...}
  created_at            timestamptz not null default now()
);

alter table public.audio_uploads enable row level security;

create index if not exists audio_uploads_workspace_idx
  on public.audio_uploads (workspace_id, created_at desc);

create index if not exists audio_uploads_user_idx
  on public.audio_uploads (user_id, created_at desc);

drop policy if exists "audio_uploads_ws_select" on public.audio_uploads;
create policy "audio_uploads_ws_select" on public.audio_uploads for select
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "audio_uploads_ws_insert" on public.audio_uploads;
create policy "audio_uploads_ws_insert" on public.audio_uploads for insert
  with check (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()) and user_id = auth.uid());

drop policy if exists "audio_uploads_ws_delete" on public.audio_uploads;
create policy "audio_uploads_ws_delete" on public.audio_uploads for delete
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 6. voice_jobs — background job tracker for long-running voice operations
--    (translation, dubbing, cloning, async STT/TTS).
-- -----------------------------------------------------------------------------
create table if not exists public.voice_jobs (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  generation_id         uuid references public.voice_generations (id) on delete cascade,
  provider              text not null,
  external_job_id       text,                           -- provider's job id (e.g. ElevenLabs dubbing project id)
  status                text not null default 'pending' check (status in ('pending','processing','completed','failed','cancelled')),
  progress              integer not null default 0,    -- 0..100
  result_url            text,                           -- populated when status='completed'
  error                 text,                           -- populated when status='failed'
  started_at            timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.voice_jobs enable row level security;

create index if not exists voice_jobs_workspace_idx
  on public.voice_jobs (workspace_id, created_at desc);

create index if not exists voice_jobs_status_idx
  on public.voice_jobs (workspace_id, status);

create index if not exists voice_jobs_generation_idx
  on public.voice_jobs (generation_id);

create index if not exists voice_jobs_external_idx
  on public.voice_jobs (provider, external_job_id) where external_job_id is not null;

drop policy if exists "voice_jobs_ws_select" on public.voice_jobs;
create policy "voice_jobs_ws_select" on public.voice_jobs for select
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "voice_jobs_ws_insert" on public.voice_jobs;
create policy "voice_jobs_ws_insert" on public.voice_jobs for insert
  with check (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "voice_jobs_ws_update" on public.voice_jobs;
create policy "voice_jobs_ws_update" on public.voice_jobs for update
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "voice_jobs_ws_delete" on public.voice_jobs;
create policy "voice_jobs_ws_delete" on public.voice_jobs for delete
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 7. voice_usage — daily per-user usage rollup. Unique on
--    (workspace_id, user_id, metric_date) so the service upserts a single
--    row per day per user.
-- -----------------------------------------------------------------------------
create table if not exists public.voice_usage (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  user_id               uuid not null references auth.users (id) on delete cascade,
  metric_date           date not null default current_date,
  generations           integer not null default 0,
  credits_used          integer not null default 0,
  by_type               jsonb not null default '{}',   -- {tts:5, stt:3, translate:1, dub:0, clone:0}
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (workspace_id, user_id, metric_date)
);

alter table public.voice_usage enable row level security;

create index if not exists voice_usage_workspace_idx
  on public.voice_usage (workspace_id, metric_date desc);

create index if not exists voice_usage_user_idx
  on public.voice_usage (user_id, metric_date desc);

drop policy if exists "voice_usage_ws_select" on public.voice_usage;
create policy "voice_usage_ws_select" on public.voice_usage for select
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "voice_usage_ws_insert" on public.voice_usage;
create policy "voice_usage_ws_insert" on public.voice_usage for insert
  with check (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "voice_usage_ws_update" on public.voice_usage;
create policy "voice_usage_ws_update" on public.voice_usage for update
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 8. Updated_at triggers for the new tables that have updated_at columns.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  new_tables text[] := array['voice_generations', 'voice_models', 'voice_profiles', 'voice_jobs', 'voice_usage'];
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
-- 9. Seed the voice_models catalog (idempotent via ON CONFLICT).
--    Prices are illustrative — operators can update them post-install.
--    The provider catalog in `src/lib/ai/voice-providers/*` mirrors these
--    values for callers that don't have the DB hydrated yet.
-- -----------------------------------------------------------------------------
insert into public.voice_models (provider, model_id, name, description, type, supported_languages, supported_voices, is_active, metadata)
values
  -- OpenAI ----------------------------------------------------------------
  ('openai', 'tts-1', 'OpenAI TTS-1', 'Fast, affordable text-to-speech for real-time use.', 'tts',
    '{en-US}'::text[],
    '[{"id":"alloy","label":"Alloy","language":"en-US","gender":"neutral"},{"id":"echo","label":"Echo","language":"en-US","gender":"male"},{"id":"fable","label":"Fable","language":"en-US","gender":"neutral"},{"id":"onyx","label":"Onyx","language":"en-US","gender":"male"},{"id":"nova","label":"Nova","language":"en-US","gender":"female"},{"id":"shimmer","label":"Shimmer","language":"en-US","gender":"female"}]'::jsonb,
    true, '{"format":"mp3","speed_range":[0.25,4]}'),
  ('openai', 'tts-1-hd', 'OpenAI TTS-1 HD', 'Higher-fidelity TTS for production audio.', 'tts',
    '{en-US}'::text[],
    '[{"id":"alloy","label":"Alloy","language":"en-US","gender":"neutral"},{"id":"echo","label":"Echo","language":"en-US","gender":"male"},{"id":"fable","label":"Fable","language":"en-US","gender":"neutral"},{"id":"onyx","label":"Onyx","language":"en-US","gender":"male"},{"id":"nova","label":"Nova","language":"en-US","gender":"female"},{"id":"shimmer","label":"Shimmer","language":"en-US","gender":"female"}]'::jsonb,
    true, '{"format":"mp3","speed_range":[0.25,4]}'),
  ('openai', 'whisper-1', 'OpenAI Whisper', 'General-purpose speech-to-text in 50+ languages.', 'stt',
    '{en-US,en-GB,es-ES,fr-FR,de-DE,it-IT,pt-BR,ja-JP,zh-CN,hi-IN}'::text[],
    '[]'::jsonb,
    true, '{"max_file_size_mb":25}'),

  -- ElevenLabs ------------------------------------------------------------
  ('elevenlabs', 'eleven-multilingual-v2', 'Eleven Multilingual v2', 'Multilingual TTS supporting 29 languages with high emotional range.', 'tts',
    '{en-US,en-GB,es-ES,fr-FR,de-DE,it-IT,pt-BR,ja-JP,zh-CN,hi-IN}'::text[],
    '[{"id":"21m00Tcm4TlvDq8ikWAM","label":"Rachel","language":"en-US","gender":"female"},{"id":"AZnzlk1XvdvUeBnXldC9","label":"Adam","language":"en-US","gender":"male"},{"id":"EXAVITQu4vr4xnSDxMaL","label":"Bella","language":"en-US","gender":"female"}]'::jsonb,
    true, '{"supports_cloning":true,"supports_streaming":true}'),
  ('elevenlabs', 'eleven-monolingual-v1', 'Eleven Monolingual v1', 'English-only TTS optimized for low latency.', 'tts',
    '{en-US,en-GB}'::text[],
    '[{"id":"21m00Tcm4TlvDq8ikWAM","label":"Rachel","language":"en-US","gender":"female"},{"id":"AZnzlk1XvdvUeBnXldC9","label":"Adam","language":"en-US","gender":"male"}]'::jsonb,
    true, '{"supports_cloning":false}'),

  -- Google ----------------------------------------------------------------
  ('google', 'gemini-2.0-flash-tts', 'Google Gemini TTS', 'Natural-voice TTS via the Gemini API.', 'tts',
    '{en-US,es-ES,fr-FR,de-DE,it-IT,pt-BR,ja-JP,zh-CN,hi-IN}'::text[],
    '[{"id":"charon","label":"Charon","language":"en-US","gender":"male"},{"id":"fenrir","label":"Fenrir","language":"en-US","gender":"male"},{"id":"kore","label":"Kore","language":"en-US","gender":"female"}]'::jsonb,
    true, null),
  ('google', 'chirp-2', 'Google Chirp 2', 'Cloud Speech-to-Text Chirp model.', 'stt',
    '{en-US,en-GB,es-ES,fr-FR,de-DE,it-IT,pt-BR,ja-JP,zh-CN,hi-IN,ko-KR}'::text[],
    '[]'::jsonb,
    true, '{"batch_supported":true}'),

  -- Azure -----------------------------------------------------------------
  ('azure', 'azure-tts', 'Azure Neural TTS', 'Neural text-to-speech with 400+ voices across 140+ locales.', 'tts',
    '{en-US,en-GB,es-ES,fr-FR,de-DE,it-IT,pt-BR,ja-JP,zh-CN,hi-IN}'::text[],
    '[{"id":"en-US-JennyNeural","label":"Jenny","language":"en-US","gender":"female"},{"id":"en-US-GuyNeural","label":"Guy","language":"en-US","gender":"male"}]'::jsonb,
    true, null),
  ('azure', 'azure-stt', 'Azure Speech STT', 'Real-time + batch speech-to-text.', 'stt',
    '{en-US,en-GB,es-ES,fr-FR,de-DE,it-IT,pt-BR,ja-JP,zh-CN,hi-IN}'::text[],
    '[]'::jsonb,
    true, null),

  -- Deepgram --------------------------------------------------------------
  ('deepgram', 'nova-2', 'Deepgram Nova-2', 'State-of-the-art STT with fast + accurate transcription.', 'stt',
    '{en-US,en-GB,es-ES,fr-FR,de-DE,it-IT,pt-BR,ja-JP,zh-CN}'::text[],
    '[]'::jsonb,
    true, '{"streaming":true}'),
  ('deepgram', 'nova-3', 'Deepgram Nova-3', 'Latest Nova model with improved accuracy and features.', 'stt',
    '{en-US,en-GB,es-ES,fr-FR,de-DE}'::text[],
    '[]'::jsonb,
    true, '{"streaming":true}'),

  -- AssemblyAI ------------------------------------------------------------
  ('assemblyai', 'best', 'AssemblyAI Best', 'Highest-accuracy general-purpose transcription model.', 'stt',
    '{en-US,en-GB,es-ES,fr-FR,de-DE,it-IT,pt-BR,ja-JP,zh-CN,hi-IN}'::text[],
    '[]'::jsonb,
    true, '{"speaker_labels":true,"sentiment_analysis":true}'),
  ('assemblyai', 'nano', 'AssemblyAI Nano', 'Fast + low-cost model for high-volume workloads.', 'stt',
    '{en-US}'::text[],
    '[]'::jsonb,
    true, null),

  -- Cartesia --------------------------------------------------------------
  ('cartesia', 'sonic-2', 'Cartesia Sonic-2', 'Ultra-low-latency multilingual TTS.', 'tts',
    '{en-US,es-ES,fr-FR,de-DE,ja-JP,zh-CN}'::text[],
    '[{"id":"7e1a2b2e-5d8a-4d8a-9d2a-7b1c2d3e4f5a","label":"Aria","language":"en-US","gender":"female"},{"id":"2a1b3c4d-5e6f-4d8a-9d2a-7b1c2d3e4f5b","label":"Mateo","language":"en-US","gender":"male"}]'::jsonb,
    true, '{"streaming":true,"latency_ms":40}'),

  -- Play.ht ---------------------------------------------------------------
  ('playht', 'play-3', 'PlayHT Play 3', 'Multilingual low-latency TTS with cloning support.', 'tts',
    '{en-US,en-GB,es-ES,fr-FR,de-DE,it-IT,pt-BR,ja-JP,zh-CN,hi-IN}'::text[],
    '[{"id":"s3://voice-cloning/0:1","label":"Aria","language":"en-US","gender":"female"}]'::jsonb,
    true, '{"supports_cloning":true}')
on conflict (provider, model_id) do update set
  name = excluded.name,
  description = excluded.description,
  type = excluded.type,
  supported_languages = excluded.supported_languages,
  supported_voices = excluded.supported_voices,
  metadata = excluded.metadata;

-- -----------------------------------------------------------------------------
-- 10. Enable Realtime for jobs so the UI can poll for status updates.
-- -----------------------------------------------------------------------------
do $$
begin
  execute 'alter publication supabase_realtime add table public.voice_jobs';
exception
  when others then null;
end;
$$;
