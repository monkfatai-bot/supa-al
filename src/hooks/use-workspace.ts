"use client";

import { useState, useEffect } from "react";
import { getActiveWorkspaceId } from "@/services/workspace/actions";

interface WorkspaceInfo {
  id: string;
}

interface UseWorkspaceReturn {
  workspace: WorkspaceInfo | null;
  isLoading: boolean;
}

/**
 * Client-side hook that resolves the current workspace for the authenticated user.
 * Returns { workspace: { id } } and a loading flag.
 */
export function useWorkspace(): UseWorkspaceReturn {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        const id = await getActiveWorkspaceId();
        if (!cancelled && id) {
          setWorkspace({ id });
        }
      } catch {
        // silent — workspace remains null
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  return { workspace, isLoading };
}
