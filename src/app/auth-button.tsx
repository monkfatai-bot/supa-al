"use client";

import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/services/auth/actions";
import { ROUTES } from "@/config/constants";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useTransition } from "react";

export function AuthButton() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();

    // Skip authentication if Supabase is not configured
    if (!supabase) {
      return;
    }

    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserEmail(user?.email ?? null);
    }

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  function handleLogout() {
    startTransition(async () => {
      await logout();
    });
  }

  if (userEmail) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {userEmail}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          disabled={pending}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </div>
    );
  }

  return (
    <Button asChild size="sm">
      <Link href={ROUTES.LOGIN}>
        <LogIn className="mr-2 h-4 w-4" />
        Log in
      </Link>
    </Button>
  );
}
