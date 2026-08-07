-- =============================================================================
-- SUPA AI — 0002_storage_buckets.sql
-- Storage buckets + per-bucket RLS policies.
--
-- Buckets:
--   avatars   — public,  2 MB, images only (profile pictures).
--   uploads   — private, 25 MB, all commonly-allowed MIME types.
--   ai-assets — private, 50 MB, image/audio/video + pdf for AI pipelines.
--
-- Path convention: `{user_id}/{yyyy}/{mm}/{uuid}/{sanitized-filename}`.
-- The first path segment is therefore the owning user_id, which we use as
-- the ownership check in storage policies via `storage.foldername(name)`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Buckets
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads', 'uploads', false, 26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'text/plain', 'text/csv', 'text/markdown',
    'application/json',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-assets', 'ai-assets', false, 52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/mpeg', 'audio/wav', 'audio/webm',
    'video/mp4', 'video/webm',
    'application/pdf',
    'application/json', 'text/plain'
  ]
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- avatars (public read, authenticated owner write)
-- -----------------------------------------------------------------------------
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- uploads (private — only the owner can read/write)
-- Direct bucket reads require RLS; signed URLs bypass RLS because they are
-- pre-authorized server-side.
-- -----------------------------------------------------------------------------
drop policy if exists "uploads_owner_read" on storage.objects;
create policy "uploads_owner_read"
  on storage.objects for select
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "uploads_owner_insert" on storage.objects;
create policy "uploads_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "uploads_owner_update" on storage.objects;
create policy "uploads_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "uploads_owner_delete" on storage.objects;
create policy "uploads_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- ai-assets (private — owner-only; service role writes from pipelines)
-- -----------------------------------------------------------------------------
drop policy if exists "ai_assets_owner_read" on storage.objects;
create policy "ai_assets_owner_read"
  on storage.objects for select
  using (
    bucket_id = 'ai-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "ai_assets_owner_insert" on storage.objects;
create policy "ai_assets_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'ai-assets'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "ai_assets_owner_update" on storage.objects;
create policy "ai_assets_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'ai-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'ai-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "ai_assets_owner_delete" on storage.objects;
create policy "ai_assets_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'ai-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
