-- =============================================
-- Phase 5: AI Content Studio - ai_contents table
-- =============================================

-- Content types enum
CREATE TYPE public.content_type AS ENUM (
  'blog_post',
  'social_media',
  'marketing_copy',
  'product_description',
  'email_draft',
  'general_writing'
);

-- AI Contents table
CREATE TABLE IF NOT EXISTS public.ai_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Content',
  content_type public.content_type NOT NULL DEFAULT 'general_writing',
  prompt TEXT NOT NULL,
  generated_content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_contents_user_id ON public.ai_contents(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_contents_user_updated ON public.ai_contents(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_contents_content_type ON public.ai_contents(user_id, content_type);

-- RLS: Enable
ALTER TABLE public.ai_contents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own content"
  ON public.ai_contents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own content"
  ON public.ai_contents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own content"
  ON public.ai_contents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own content"
  ON public.ai_contents FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_ai_contents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_ai_contents_updated_at
  BEFORE UPDATE ON public.ai_contents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_contents_updated_at();
