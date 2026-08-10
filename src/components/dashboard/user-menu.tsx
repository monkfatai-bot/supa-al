"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { logout } from "@/services/auth/actions";
import { getInitials } from "@/lib/utils";

interface UserMenuProps {
  userName: string | null;
  userEmail: string | null;
  avatarUrl: string | null;
}

export function UserMenu({ userName, userEmail, avatarUrl }: UserMenuProps) {
  const router = useRouter();
  const initials = getInitials(userName);

  async function handleLogout() {
    await logout();
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage src={avatarUrl ?? undefined} alt={userName ?? "User"} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {userName ?? "User"}
            </p>
            {userEmail && (
              <p className="text-muted-foreground text-xs leading-none">
                {userEmail}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <button
            type="button"
            className="flex w-full items-center"
            onClick={() => router.push("/dashboard/settings")}
          >
            <User className="mr-2 h-4 w-4" />
            Profile
          </button>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <button
            type="button"
            className="flex w-full items-center"
            onClick={() => router.push("/dashboard/settings")}
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </button>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            void handleLogout();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
