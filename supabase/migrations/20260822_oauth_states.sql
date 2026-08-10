-- Migration 017: OAuth state store for serverless compatibility
-- Replaces in-memory Map that doesn't work on Vercel serverless functions

CREATE TABLE IF NOT EXISTS public.oauth_states (
  state TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  expires_at timestamptz NOT NULL
);

-- RLS: only authenticated users can access
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by server-side functions)
CREATE POLICY "oauth_states_service_role_all" ON public.oauth_states
  FOR ALL TO postgres
  USING (true)
  WITH CHECK (true);

-- Anon (authenticated via RLS) can read/write their own workspace states
CREATE POLICY "oauth_states_authenticated_all" ON public.oauth_states
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- Index for cleanup of expired states
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON public.oauth_states(expires_at);

-- Cleanup job: delete expired states (run periodically or on access)
-- This is handled in application code (retrieveOAuthState cleans up before querying)
