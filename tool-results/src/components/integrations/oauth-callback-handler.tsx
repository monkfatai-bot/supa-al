"use client";

/**
 * Supa AI — Phase 10 Integration Hub — OAuth callback handler.
 *
 * Client-side component that renders on `/api/v1/integrations/oauth/callback`
 * success: shows a brief "Authorizing…" state, then redirects back to
 * the dashboard. Used by the OAuth2 flow when a provider redirects
 * back to the app after the user grants access.
 *
 * @module @/components/integrations/oauth-callback-handler
 */
import * as React from "react";
import { Check, Loader2, X } from "lucide-react";

import { useOAuthCallback } from "@/hooks/use-integrations";

interface OAuthCallbackHandlerProps {
  connectorKey?: string;
  workspaceId?: string;
  code?: string;
  state?: string;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

export function OAuthCallbackHandler({
  connectorKey,
  workspaceId,
  code,
  state,
  onSuccess,
  onError,
}: OAuthCallbackHandlerProps) {
  const mutation = useOAuthCallback();

  React.useEffect(() => {
    if (!connectorKey || !workspaceId) return;
    mutation.mutate(
      { connector_key: connectorKey, workspace_id: workspaceId },
      {
        onSuccess: (data) => {
          onSuccess?.();
          // Allow 1 second for the user to read the success message.
          setTimeout(() => {
            window.location.href = "/";
          }, 1000);
        },
        onError: (err: Error) => {
          onError?.(err);
        },
      },
    );
  }, [connectorKey, workspaceId, mutation]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
      {mutation.isPending ? (
        <>
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Authorizing…</p>
        </>
      ) : mutation.isSuccess ? (
        <>
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <Check className="size-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">Connected!</p>
          <p className="text-xs text-muted-foreground">
            Redirecting you back to the dashboard…
          </p>
        </>
      ) : (
        <>
          <div className="flex size-12 items-center justify-center rounded-full bg-red-500/10 text-red-600">
            <X className="size-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">Authorization failed</p>
          <p className="max-w-xs text-center text-xs text-muted-foreground">
            {mutation.error?.message ?? "Please try again."}
          </p>
        </>
      )}
    </div>
  );
}
