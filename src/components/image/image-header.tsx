"use client";

import Link from "next/link";
import { ImageIcon, Zap } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { UserMenu } from "@/components/dashboard/user-menu";

interface ImageHeaderProps {
  userName: string | null;
  userEmail: string | null;
  avatarUrl: string | null;
}

export function ImageHeader({ userName, userEmail, avatarUrl }: ImageHeaderProps) {
  return (
    <header className="flex h-16 items-center gap-2 border-b px-4">
      <Link href="/dashboard" className="flex items-center gap-2">
        <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
          <Zap className="size-4" />
        </div>
        <span className="hidden font-semibold sm:inline-block">Supa AI</span>
      </Link>
      <Separator orientation="vertical" className="mx-2 h-4" />
      <ImageIcon className="h-4 w-4" />
      <span className="text-sm font-medium">Image Studio</span>
      <div className="flex-1" />
      <UserMenu
        userName={userName}
        userEmail={userEmail}
        avatarUrl={avatarUrl}
      />
    </header>
  );
}
