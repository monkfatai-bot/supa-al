-- =============================================
-- Phase 3: AI Chat Engine — Enhanced Tables
-- =============================================

-- AI Usage tracking table
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(12, 8) NOT NULL DEFAULT 0,
  processing_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'cancelled')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prompt templates table
CREATE TABLE IF NOT EXISTS public.prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  variables JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- File attachments table
CREATE TABLE IF NOT EXISTS public.file_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  content_text TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add columns to conversations for archive/pin
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

-- Add columns to messages for provider/model/token tracking
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS input_tokens INTEGER DEFAULT 0;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS output_tokens INTEGER DEFAULT 0;

-- Provider health monitoring table
CREATE TABLE IF NOT EXISTS public.provider_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  is_healthy BOOLEAN NOT NULL DEFAULT true,
  avg_latency_ms INTEGER DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, model)
);

-- AI Models registry table (stores per-instance config)
CREATE TABLE IF NOT EXISTS public.ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  context_window INTEGER NOT NULL DEFAULT 0,
  max_output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_per_request NUMERIC(12, 8) NOT NULL DEFAULT 0,
  capabilities JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Storage bucket for file attachments (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'file-attachments',
  'file-attachments',
  false,
  10485760, -- 10MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON public.ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON public.ai_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_conversation ON public.ai_usage(conversation_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_user ON public.prompt_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_user_category ON public.prompt_templates(user_id, category);
CREATE INDEX IF NOT EXISTS idx_file_attachments_conversation ON public.file_attachments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_file_attachments_message ON public.file_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_archived ON public.conversations(user_id, is_archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_pinned ON public.conversations(user_id, is_pinned, updated_at DESC);

-- RLS: Enable on all new tables
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

-- RLS: ai_usage
CREATE POLICY "Users can view own ai_usage"
  ON public.ai_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ai_usage"
  ON public.ai_usage FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS: prompt_templates
CREATE POLICY "Users can view own prompt_templates"
  ON public.prompt_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own prompt_templates"
  ON public.prompt_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own prompt_templates"
  ON public.prompt_templates FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own prompt_templates"
  ON public.prompt_templates FOR DELETE USING (auth.uid() = user_id);

-- RLS: file_attachments
CREATE POLICY "Users can view own file_attachments"
  ON public.file_attachments FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = file_attachments.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert own file_attachments"
  ON public.file_attachments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own file_attachments"
  ON public.file_attachments FOR DELETE USING (auth.uid() = user_id);

-- RLS: file-attachments storage bucket
CREATE POLICY "Users can upload files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'file-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read own files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'file-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'file-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Auto-update triggers
CREATE OR REPLACE FUNCTION public.update_prompt_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_prompt_templates_updated_at
  BEFORE UPDATE ON public.prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_prompt_templates_updated_at();

CREATE OR REPLACE FUNCTION public.update_provider_health_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_provider_health_updated_at
  BEFORE UPDATE ON public.provider_health
  FOR EACH ROW EXECUTE FUNCTION public.update_provider_health_updated_at();

CREATE OR REPLACE FUNCTION public.update_ai_models_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_ai_models_updated_at
  BEFORE UPDATE ON public.ai_models
  FOR EACH ROW EXECUTE FUNCTION public.update_ai_models_updated_at();
