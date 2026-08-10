-- =============================================
-- Phase 7: AI Workspace, Documents & Collaboration
-- Tables: folders, documents, document_versions,
--   comments, mentions, knowledge_base, file_library
-- =============================================

-- Extend workspace_role enum with new granular roles
-- (PostgreSQL cannot ALTER ENUM, so we use CHECK constraints in code)
-- We keep the base 4-role enum and add workspace_settings JSON for permissions.

-- Extend notification_type for new notification categories
ALTER TYPE public.notification_type RENAME TO notification_type_old;
CREATE TYPE public.notification_type AS ENUM (
  'system',
  'workspace',
  'security',
  'billing',
  'mention',
  'comment',
  'document_share',
  'member_invite',
  'ai_task_complete',
  'workspace_alert'
);
ALTER TABLE public.notifications ALTER COLUMN type TYPE public.notification_type
  USING type::text::public.notification_type;
DROP TYPE public.notification_type_old;

-- Extend activity_action enum
ALTER TYPE public.activity_action RENAME TO activity_action_old;
CREATE TYPE public.activity_action AS ENUM (
  'user_signup',
  'user_login',
  'login_success',
  'login_failed',
  'profile_update',
  'avatar_update',
  'workspace_create',
  'workspace_update',
  'workspace_delete',
  'member_join',
  'member_leave',
  'member_role_change',
  'invitation_send',
  'invitation_accept',
  'invitation_revoke',
  'settings_update',
  'chat_created',
  'content_generated',
  'image_generated',
  'video_generated',
  'voice_generated',
  'audio_uploaded',
  'security_event',
  'document_created',
  'document_updated',
  'document_deleted',
  'document_restored',
  'document_archived',
  'document_exported',
  'document_duplicated',
  'version_created',
  'version_restored',
  'folder_created',
  'folder_updated',
  'folder_deleted',
  'comment_added',
  'comment_resolved',
  'mention_created',
  'file_uploaded',
  'file_deleted',
  'file_downloaded',
  'knowledge_entry_created',
  'knowledge_entry_updated',
  'search_executed'
);
ALTER TABLE public.activity_logs ALTER COLUMN action TYPE public.activity_action
  USING action::text::public.activity_action;
DROP TYPE public.activity_action_old;

-- New enums for Phase 7

CREATE TYPE public.document_type AS ENUM (
  'rich_text',
  'markdown',
  'note',
  'report',
  'proposal',
  'contract',
  'invoice',
  'meeting_note',
  'research',
  'template'
);

CREATE TYPE public.document_status AS ENUM (
  'draft',
  'published',
  'archived',
  'deleted'
);

CREATE TYPE public.comment_status AS ENUM (
  'active',
  'resolved',
  'deleted'
);

CREATE TYPE public.knowledge_entry_type AS ENUM (
  'article',
  'faq',
  'reference',
  'guide',
  'policy',
  'note'
);

CREATE TYPE public.workspace_type AS ENUM (
  'personal',
  'team',
  'organization',
  'client',
  'shared',
  'private'
);

-- Extend workspaces table with new columns
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS workspace_type public.workspace_type NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS storage_usage_bytes BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_limit_bytes BIGINT NOT NULL DEFAULT 5368709120,
  ADD COLUMN IF NOT EXISTS ai_credit_pool BIGINT NOT NULL DEFAULT 0;

-- ─── folders ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folders_workspace ON public.folders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON public.folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_workspace_parent ON public.folders(workspace_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_sort ON public.folders(workspace_id, parent_id, sort_order);

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view folders"
  ON public.folders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = folders.workspace_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can create folders"
  ON public.folders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = folders.workspace_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can update folders"
  ON public.folders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = folders.workspace_id AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
    OR created_by = auth.uid()
  );

CREATE POLICY "Workspace owners/admins or creators can delete folders"
  ON public.folders FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = folders.workspace_id AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
    OR created_by = auth.uid()
  );

-- ─── documents ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT NOT NULL DEFAULT '',
  document_type public.document_type NOT NULL DEFAULT 'rich_text',
  status public.document_status NOT NULL DEFAULT 'draft',
  version_number INTEGER NOT NULL DEFAULT 1,
  word_count INTEGER NOT NULL DEFAULT 0,
  character_count INTEGER NOT NULL DEFAULT 0,
  cover_image_url TEXT DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  last_edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  settings JSONB NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_workspace ON public.documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder ON public.documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_type ON public.documents(workspace_id, document_type);
CREATE INDEX IF NOT EXISTS idx_documents_updated ON public.documents(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_creator ON public.documents(created_by);
CREATE INDEX IF NOT EXISTS idx_documents_search ON public.documents USING gin(to_tsvector('english', title || ' ' || coalesce(content, '')));

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view documents"
  ON public.documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = documents.workspace_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can create documents"
  ON public.documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = documents.workspace_id AND user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Workspace members can update documents"
  ON public.documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = documents.workspace_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace owners/admins or creators can delete documents"
  ON public.documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = documents.workspace_id AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
    OR created_by = auth.uid()
  );

-- ─── document_versions ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  change_summary TEXT DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  character_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_doc_versions_document ON public.document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_number ON public.document_versions(document_id, version_number DESC);

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view document versions"
  ON public.document_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = document_versions.document_id AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can create document versions"
  ON public.document_versions FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = document_versions.document_id AND wm.user_id = auth.uid()
    )
  );

-- ─── comments ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_html TEXT DEFAULT '',
  status public.comment_status NOT NULL DEFAULT 'active',
  mentions TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_document ON public.comments(document_id);
CREATE INDEX IF NOT EXISTS idx_comments_workspace ON public.comments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON public.comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON public.comments(document_id, status);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view comments"
  ON public.comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = comments.workspace_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can create comments"
  ON public.comments FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = comments.workspace_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Comment authors can update own comments"
  ON public.comments FOR UPDATE
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = comments.workspace_id AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Comment authors or admins can delete comments"
  ON public.comments FOR DELETE
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = comments.workspace_id AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ─── mentions ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mentioned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mentions_user ON public.mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_mentions_comment ON public.mentions(comment_id);
CREATE INDEX IF NOT EXISTS idx_mentions_document ON public.mentions(document_id);
CREATE INDEX IF NOT EXISTS idx_mentions_unread ON public.mentions(mentioned_user_id, is_read);

ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mentions"
  ON public.mentions FOR SELECT
  USING (mentioned_user_id = auth.uid() OR mentioned_by = auth.uid());

CREATE POLICY "Workspace members can create mentions"
  ON public.mentions FOR INSERT
  WITH CHECK (
    mentioned_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = mentions.workspace_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own mentions"
  ON public.mentions FOR UPDATE
  USING (mentioned_user_id = auth.uid());

-- ─── knowledge_base ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  entry_type public.knowledge_entry_type NOT NULL DEFAULT 'article',
  category TEXT DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  source_urls TEXT[] NOT NULL DEFAULT '{}',
  linked_document_ids UUID[] NOT NULL DEFAULT '{}',
  is_indexed BOOLEAN NOT NULL DEFAULT false,
  search_vector TSVECTOR,
  embedding VECTOR(1536),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_workspace ON public.knowledge_base(workspace_id);
CREATE INDEX IF NOT EXISTS idx_kb_category ON public.knowledge_base(workspace_id, category);
CREATE INDEX IF NOT EXISTS idx_kb_type ON public.knowledge_base(workspace_id, entry_type);
CREATE INDEX IF NOT EXISTS idx_kb_search ON public.knowledge_base USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_kb_indexed ON public.knowledge_base(workspace_id, is_indexed);

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view knowledge base"
  ON public.knowledge_base FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = knowledge_base.workspace_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can create knowledge entries"
  ON public.knowledge_base FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = knowledge_base.workspace_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can update knowledge entries"
  ON public.knowledge_base FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = knowledge_base.workspace_id AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Workspace owners/admins or creators can delete knowledge entries"
  ON public.knowledge_base FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = knowledge_base.workspace_id AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ─── file_library ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.file_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  file_url TEXT DEFAULT '',
  thumbnail_url TEXT DEFAULT '',
  thumbnail_storage_path TEXT DEFAULT '',
  version_number INTEGER NOT NULL DEFAULT 1,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}',
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_library_workspace ON public.file_library(workspace_id);
CREATE INDEX IF NOT EXISTS idx_file_library_folder ON public.file_library(folder_id);
CREATE INDEX IF NOT EXISTS idx_file_library_mime ON public.file_library(workspace_id, mime_type);
CREATE INDEX IF NOT EXISTS idx_file_library_uploaded ON public.file_library(workspace_id, created_at DESC);

ALTER TABLE public.file_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view files"
  ON public.file_library FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = file_library.workspace_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can upload files"
  ON public.file_library FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = file_library.workspace_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "File uploaders or admins can update files"
  ON public.file_library FOR UPDATE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = file_library.workspace_id AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "File uploaders or admins can delete files"
  ON public.file_library FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = file_library.workspace_id AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ─── Auto-update triggers ───────────────────────────────

CREATE OR REPLACE FUNCTION public.update_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_folders_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.update_folders_updated_at();

CREATE OR REPLACE FUNCTION public.update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_documents_updated_at();

CREATE OR REPLACE FUNCTION public.update_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.update_comments_updated_at();

CREATE OR REPLACE FUNCTION public.update_knowledge_base_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_knowledge_base_updated_at
  BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.update_knowledge_base_updated_at();

CREATE OR REPLACE FUNCTION public.update_file_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_file_library_updated_at
  BEFORE UPDATE ON public.file_library
  FOR EACH ROW EXECUTE FUNCTION public.update_file_library_updated_at();

-- ─── Knowledge base search vector auto-update ───────────

CREATE OR REPLACE FUNCTION public.update_kb_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_kb_search_vector
  BEFORE INSERT OR UPDATE OF title, content ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.update_kb_search_vector();

-- ─── Document search vector auto-update ─────────────────

CREATE OR REPLACE FUNCTION public.update_documents_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the GIN index on documents via a trigger
  -- The search index was created with to_tsvector expression
  -- We update last_edited_at to indicate content changes
  IF NEW.content IS DISTINCT FROM OLD.content OR NEW.title IS DISTINCT FROM OLD.title THEN
    NEW.last_edited_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_documents_content_changed
  BEFORE UPDATE OF title, content ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_documents_search_vector();

-- ─── Workspace Files Storage Bucket ─────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspace-files',
  'workspace-files',
  false,
  104857600,
  '{
    application/pdf,
    application/msword,
    application/vnd.openxmlformats-officedocument.wordprocessingml.document,
    application/vnd.ms-excel,
    application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
    application/vnd.ms-powerpoint,
    application/vnd.openxmlformats-officedocument.presentationml.presentation,
    text/plain,
    text/csv,
    text/markdown,
    application/json,
    image/png,
    image/jpeg,
    image/gif,
    image/webp,
    image/svg+xml,
    video/mp4,
    video/webm,
    audio/mpeg,
    audio/wav,
    audio/ogg,
    application/zip
  }'
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for workspace-files bucket
CREATE POLICY "Workspace members can upload files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'workspace-files'
    AND (storage.foldername(name))[2] IN (
      SELECT workspace_id::text FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can view files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'workspace-files'
    AND (
      (storage.foldername(name))[1] = 'exports'
      OR (storage.foldername(name))[2] IN (
        SELECT workspace_id::text FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "File uploaders or admins can update files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'workspace-files'
    AND (
      (storage.foldername(name))[3] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = (storage.foldername(name))[2]::uuid
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "File uploaders or admins can delete files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'workspace-files'
    AND (
      (storage.foldername(name))[3] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = (storage.foldername(name))[2]::uuid
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
      )
    )
  );

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;
