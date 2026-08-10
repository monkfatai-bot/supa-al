-- =============================================
-- Phase 4: AI Image Generation Engine (Complete)
-- =============================================

-- Alter ai_image_generations to add missing columns
ALTER TABLE public.ai_image_generations
  ADD COLUMN IF NOT EXISTS generation_type TEXT NOT NULL DEFAULT 'text-to-image',
  ADD COLUMN IF NOT EXISTS aspect_ratio TEXT NOT NULL DEFAULT '1:1',
  ADD COLUMN IF NOT EXISTS num_images INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS credits_used INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generation_time_ms INT,
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

-- Add index for favorites
CREATE INDEX IF NOT EXISTS idx_ai_image_generations_user_favorite
  ON public.ai_image_generations(user_id, is_favorite);

CREATE INDEX IF NOT EXISTS idx_ai_image_generations_user_provider
  ON public.ai_image_generations(user_id, provider);

-- image_models: catalog of available image models
CREATE TABLE IF NOT EXISTS public.image_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  supported_sizes TEXT[] NOT NULL DEFAULT '{"1024x1024"}',
  supported_aspect_ratios TEXT[] NOT NULL DEFAULT '{"1:1"}',
  supported_generation_types TEXT[] NOT NULL DEFAULT '{"text-to-image"}',
  credit_cost INT NOT NULL DEFAULT 1,
  max_resolution TEXT NOT NULL DEFAULT '1024x1024',
  quality TEXT NOT NULL DEFAULT 'medium',
  speed TEXT NOT NULL DEFAULT 'medium',
  supports_negative_prompt BOOLEAN NOT NULL DEFAULT false,
  supports_seed BOOLEAN NOT NULL DEFAULT false,
  supports_guidance_scale BOOLEAN NOT NULL DEFAULT false,
  supports_steps BOOLEAN NOT NULL DEFAULT false,
  supports_strength BOOLEAN NOT NULL DEFAULT false,
  max_num_images INT NOT NULL DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_models_provider ON public.image_models(provider);
CREATE INDEX IF NOT EXISTS idx_image_models_enabled ON public.image_models(is_enabled);

-- image_styles: user-customizable style presets
CREATE TABLE IF NOT EXISTS public.image_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prompt_prefix TEXT NOT NULL DEFAULT '',
  prompt_suffix TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'Palette',
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_styles_user_id ON public.image_styles(user_id);

-- image_uploads: uploaded images for editing
CREATE TABLE IF NOT EXISTS public.image_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INT NOT NULL,
  width INT,
  height INT,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_uploads_user_id ON public.image_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_image_uploads_user_created ON public.image_uploads(user_id, created_at DESC);

-- image_usage: credit tracking per image generation
CREATE TABLE IF NOT EXISTS public.image_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES public.ai_image_generations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'generation',
  credits_used INT NOT NULL DEFAULT 0,
  credits_refunded INT NOT NULL DEFAULT 0,
  processing_ms INT,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_usage_user_id ON public.image_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_image_usage_user_created ON public.image_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_image_usage_generation_id ON public.image_usage(generation_id);

-- RLS: Enable on all new tables
ALTER TABLE public.image_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_usage ENABLE ROW LEVEL SECURITY;

-- RLS: image_models (public read, no user insert)
CREATE POLICY "Anyone can view image models"
  ON public.image_models FOR SELECT
  USING (true);

-- RLS: image_styles
CREATE POLICY "Users can view own or builtin styles"
  ON public.image_styles FOR SELECT
  USING (is_builtin = true OR auth.uid() = user_id);

CREATE POLICY "Users can create own image styles"
  ON public.image_styles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own image styles"
  ON public.image_styles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own image styles"
  ON public.image_styles FOR DELETE
  USING (auth.uid() = user_id);

-- RLS: image_uploads
CREATE POLICY "Users can view own image uploads"
  ON public.image_uploads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own image uploads"
  ON public.image_uploads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own image uploads"
  ON public.image_uploads FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own image uploads"
  ON public.image_uploads FOR DELETE
  USING (auth.uid() = user_id);

-- RLS: image_usage
CREATE POLICY "Users can view own image usage"
  ON public.image_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own image usage"
  ON public.image_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Auto-update triggers
CREATE OR REPLACE FUNCTION public.update_image_models_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_image_models_updated_at ON public.image_models;
CREATE TRIGGER set_image_models_updated_at
  BEFORE UPDATE ON public.image_models
  FOR EACH ROW
  EXECUTE FUNCTION public.update_image_models_updated_at();

CREATE OR REPLACE FUNCTION public.update_image_styles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_image_styles_updated_at ON public.image_styles;
CREATE TRIGGER set_image_styles_updated_at
  BEFORE UPDATE ON public.image_styles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_image_styles_updated_at();

CREATE OR REPLACE FUNCTION public.update_image_uploads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_image_uploads_updated_at ON public.image_uploads;
CREATE TRIGGER set_image_uploads_updated_at
  BEFORE UPDATE ON public.image_uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_image_uploads_updated_at();

-- Storage: Create image-uploads bucket for editing source images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'image-uploads',
  'image-uploads',
  false,
  10485760,
  '{image/png,image/jpeg,image/webp}'
) ON CONFLICT (id) DO NOTHING;

-- Storage RLS for image-uploads
CREATE POLICY "Users can upload own editing images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'image-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own editing images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'image-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own editing images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'image-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
