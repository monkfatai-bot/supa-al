"use client";

import Link from "next/link";
import { FileText, Zap } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { UserMenu } from "@/components/dashboard/user-menu";

interface ContentHeaderProps {
  userName: string | null;
  userEmail: string | null;
  avatarUrl: string | null;
}

export function ContentHeader({ userName, userEmail, avatarUrl }: ContentHeaderProps) {
  return (
    <header className="flex h-16 items-center gap-2 border-b px-4">
      <Link href="/dashboard" className="flex items-center gap-2">
        <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
          <Zap className="size-4" />
        </div>
        <span className="hidden font-semibold sm:inline-block">Supa AI</span>
      </Link>
      <Separator orientation="vertical" className="mx-2 h-4" />
      <FileText className="h-4 w-4" />
      <span className="text-sm font-medium">Content Studio</span>
      <div className="flex-1" />
      <UserMenu
        userName={userName}
        userEmail={userEmail}
        avatarUrl={avatarUrl}
      />
    </header>
  );
}
