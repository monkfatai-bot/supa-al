"use client";

/**
 * Supa AI — Settings / Connected accounts section.
 *
 * Lists every supported OAuth provider (email, google, github, microsoft,
 * apple) and shows whether each is connected to the caller's account:
 *
 *   - "Connected" badge + provider email + "Disconnect" button when linked.
 *   - "Connect" button when not linked — kicks off the PKCE OAuth flow.
 *   - The primary `email` provider is locked: it cannot be disconnected.
 *
 * Reads via `useListLinkedAccounts` (GET `/api/linked-accounts`); writes
 * via `useUnlinkAccount` (DELETE `/api/linked-accounts/:provider`) and
 * `requestOAuthSignin` (POST `/api/auth/oauth/signin` → navigate).
 *
 * @module @/components/settings/sections/connected-accounts-section
 */
import * as React from "react";
import {
  Apple,
  Github,
  Loader2,
  Lock,
  Mail,
  Plug,
  Unplug,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import type { LinkedAccount, LinkedAccountProvider } from "@/lib/auth";
import {
  requestOAuthSignin,
  useListLinkedAccounts,
  useUnlinkAccount,
  type SettingsApiError,
} from "@/hooks/use-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shared/empty-state";

// ---------------------------------------------------------------------------
// Brand glyphs (Lucide doesn't ship Google / Microsoft logos).
// Cast to `LucideIcon` so the PROVIDERS array stays homogeneous. Declared
// before PROVIDERS so the const bindings are initialized when the array
// is built at module load.
// ---------------------------------------------------------------------------

const GoogleIcon = ((props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="currentColor"
    aria-hidden="true"
    {...props}
  >
    <path d="M12 11v2.7h7.4c-.3 1.9-2.2 5.6-7.4 5.6-4.5 0-8.1-3.7-8.1-8.3S7.5 2.7 12 2.7c2.5 0 4.2 1.1 5.2 2l2.3-2.2C18 .6 15.3 0 12 0 5.4 0 0 5.4 0 12s5.4 12 12 12c6.9 0 11.5-4.9 11.5-11.8 0-.8-.1-1.4-.2-2H12z" />
  </svg>
)) as unknown as LucideIcon;

const MicrosoftIcon = ((props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="currentColor"
    aria-hidden="true"
    {...props}
  >
    <path d="M0 0h11.4v11.4H0V0zm12.6 0H24v11.4H12.6V0zM0 12.6h11.4V24H0V12.6zm12.6 0H24V24H12.6V12.6z" />
  </svg>
)) as unknown as LucideIcon;

/** A supported provider — we render a row for every entry below. */
interface ProviderMeta {
  id: LinkedAccountProvider | "microsoft" | "apple";
  label: string;
  description: string;
  /** Brand glyph. Lucide ships GitHub / Apple / Mail; Google + Microsoft are custom SVGs (cast to `LucideIcon`). */
  icon: LucideIcon;
  /** `true` for the primary email provider — cannot be unlinked. */
  primary?: boolean;
}

const PROVIDERS: readonly ProviderMeta[] = [
  {
    id: "email",
    label: "Email",
    description: "Your primary sign-in email + password.",
    icon: Mail,
    primary: true,
  },
  {
    id: "google",
    label: "Google",
    description: "Sign in with your Google account.",
    icon: GoogleIcon,
  },
  {
    id: "github",
    label: "GitHub",
    description: "Sign in with your GitHub account.",
    icon: Github,
  },
  {
    id: "microsoft",
    label: "Microsoft",
    description: "Sign in with a Microsoft account.",
    icon: MicrosoftIcon,
  },
  {
    id: "apple",
    label: "Apple",
    description: "Sign in with your Apple ID.",
    icon: Apple,
  },
] as const;

export function ConnectedAccountsSection() {
  const { data, isLoading, isError, error, refetch } = useListLinkedAccounts();
  const unlink = useUnlinkAccount();
  const [pendingProvider, setPendingProvider] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState<string | null>(null);

  const accounts = data?.accounts ?? [];

  function findLinked(provider: string): LinkedAccount | undefined {
    return accounts.find((a) => a.provider === provider);
  }

  async function onConnect(provider: "google" | "github" | "microsoft" | "apple") {
    setConnecting(provider);
    try {
      const url = await requestOAuthSignin({
        provider,
        redirectTo: "/",
      });
      // Hand off to the OAuth provider — full page navigation.
      window.location.assign(url);
    } catch (err) {
      const apiErr = err as SettingsApiError;
      toast.error("Couldn't start OAuth flow", {
        description: apiErr?.message ?? "Please try again.",
      });
      setConnecting(null);
    }
  }

  async function onDisconnect(provider: string) {
    setPendingProvider(provider);
    try {
      await unlink.mutateAsync(provider);
      toast.success("Account disconnected", {
        description: `${PROVIDERS.find((p) => p.id === provider)?.label ?? provider} was unlinked.`,
      });
    } catch (err) {
      const apiErr = err as SettingsApiError;
      toast.error("Couldn't disconnect", {
        description: apiErr?.message ?? "Please try again.",
      });
    } finally {
      setPendingProvider(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {PROVIDERS.map((p) => (
          <Skeleton key={p.id} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={Plug}
        title="Couldn't load connected accounts"
        description={(error as SettingsApiError)?.message ?? "Please try again."}
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Connected accounts</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Link external providers so you can sign in with a single click. Your
          primary email cannot be unlinked.
        </p>
      </div>

      <ul className="divide-y rounded-lg border">
        {PROVIDERS.map((provider) => {
          const linked = findLinked(provider.id);
          const isConnecting = connecting === provider.id;
          const isPending = pendingProvider === provider.id;
          return (
            <li
              key={provider.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3 min-w-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <provider.icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{provider.label}</p>
                    {linked ? (
                      <Badge variant="secondary" className="bg-brand-muted/40 text-brand">
                        Connected
                      </Badge>
                    ) : null}
                    {provider.primary ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} className="inline-flex text-muted-foreground">
                            <Lock className="size-3" aria-hidden="true" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          The primary email provider cannot be unlinked
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground text-pretty">
                    {linked?.provider_email
                      ? linked.provider_email
                      : provider.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                {linked ? (
                  provider.primary ? (
                    <Button variant="ghost" size="sm" disabled>
                      <Lock className="size-4" aria-hidden="true" />
                      Locked
                    </Button>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          {isPending ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Unplug className="size-4" aria-hidden="true" />
                          )}
                          Disconnect
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Disconnect {provider.label}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            You'll no longer be able to sign in with {provider.label}.
                            You can reconnect at any time.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40"
                            onClick={(e) => {
                              e.preventDefault();
                              void onDisconnect(provider.id);
                            }}
                          >
                            Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isConnecting}
                    onClick={() =>
                      void onConnect(
                        provider.id as "google" | "github" | "microsoft" | "apple",
                      )
                    }
                  >
                    {isConnecting ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plug className="size-4" aria-hidden="true" />
                    )}
                    Connect
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
