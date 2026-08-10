-- =============================================
-- Phase 6: AI Image Generation Platform
-- =============================================

-- Image generation status enum
CREATE TYPE public.image_generation_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

-- ai_image_generations: tracks each generation request
CREATE TABLE IF NOT EXISTS public.ai_image_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  negative_prompt TEXT DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL DEFAULT 'dall-e-3',
  status public.image_generation_status NOT NULL DEFAULT 'pending',
  settings JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- image_assets: stores references to generated image files
CREATE TABLE IF NOT EXISTS public.image_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generation_id UUID NOT NULL REFERENCES public.ai_image_generations(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- image_prompts: saved prompts for reuse
CREATE TABLE IF NOT EXISTS public.image_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_image_generations_user_id ON public.ai_image_generations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_image_generations_user_status ON public.ai_image_generations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_image_generations_user_created ON public.ai_image_generations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_image_assets_user_id ON public.image_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_image_assets_generation_id ON public.image_assets(generation_id);
CREATE INDEX IF NOT EXISTS idx_image_assets_user_created ON public.image_assets(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_image_prompts_user_id ON public.image_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_image_prompts_user_created ON public.image_prompts(user_id, created_at DESC);

-- RLS: Enable on all tables
ALTER TABLE public.ai_image_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_prompts ENABLE ROW LEVEL SECURITY;

-- RLS: ai_image_generations
CREATE POLICY "Users can view own image generations"
  ON public.ai_image_generations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own image generations"
  ON public.ai_image_generations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own image generations"
  ON public.ai_image_generations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own image generations"
  ON public.ai_image_generations FOR DELETE
  USING (auth.uid() = user_id);

-- RLS: image_assets
CREATE POLICY "Users can view own image assets"
  ON public.image_assets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own image assets"
  ON public.image_assets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own image assets"
  ON public.image_assets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own image assets"
  ON public.image_assets FOR DELETE
  USING (auth.uid() = user_id);

-- RLS: image_prompts
CREATE POLICY "Users can view own image prompts"
  ON public.image_prompts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own image prompts"
  ON public.image_prompts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own image prompts"
  ON public.image_prompts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own image prompts"
  ON public.image_prompts FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at triggers
CREATE OR REPLACE FUNCTION public.update_image_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_image_assets_updated_at
  BEFORE UPDATE ON public.image_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_image_assets_updated_at();

CREATE OR REPLACE FUNCTION public.update_image_prompts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_image_prompts_updated_at
  BEFORE UPDATE ON public.image_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_image_prompts_updated_at();

-- =============================================
-- Supabase Storage: image-assets bucket
-- =============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'image-assets',
  'image-assets',
  false,
  10485760,
  '{image/png,image/jpeg,image/webp}'
) ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Users can only access their own folder ({user_id}/*)
CREATE POLICY "Users can upload own images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'image-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'image-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'image-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
