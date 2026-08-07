"use client";

/**
 * Supa AI — Phase 9 Workspace member manager.
 *
 * Lists workspace members (with role + status badges) and exposes an
 * inline "Invite member" form (email + role select) plus per-member
 * actions (change role, remove).
 *
 * Reads `/api/workspace/workspaces/:id/members` via
 * {@link useWorkspaceMembers}; mutates via
 * {@link useInviteMember}, {@link useUpdateMember}, {@link useRemoveMember}.
 *
 * @module @/components/workspace/member-manager
 */
import * as React from "react";
import { UserPlus, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkspaceRole } from "@/lib/workspace/client";
import {
  useInviteMember,
  useRemoveMember,
  useUpdateMember,
  useWorkspaceMembers,
} from "@/hooks/use-workspace";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export interface MemberManagerProps {
  workspaceId: string;
  className?: string;
}

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
  member: "Member",
};

const ROLE_VARIANT: Record<WorkspaceRole, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  editor: "outline",
  viewer: "outline",
  member: "outline",
};

function initialsFromUuid(id: string): string {
  return id.slice(0, 2).toUpperCase();
}

export function MemberManager({
  workspaceId,
  className,
}: MemberManagerProps) {
  const membersQuery = useWorkspaceMembers(workspaceId);
  const inviteMutation = useInviteMember();
  const updateMutation = useUpdateMember();
  const removeMutation = useRemoveMember();
  const { toast } = useToast();

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<WorkspaceRole>("member");

  const handleInvite = React.useCallback(async () => {
    try {
      await inviteMutation.mutateAsync({
        workspaceId,
        input: { email: inviteEmail, role: inviteRole },
      });
      toast({ title: "Invitation sent", description: inviteEmail });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("member");
    } catch (err) {
      toast({
        title: "Failed to send invitation",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [inviteMutation, inviteEmail, inviteRole, workspaceId, toast]);

  const handleRoleChange = React.useCallback(
    async (memberId: string, role: WorkspaceRole) => {
      try {
        await updateMutation.mutateAsync({
          workspaceId,
          memberId,
          input: { role },
        });
        toast({ title: "Member role updated" });
      } catch (err) {
        toast({
          title: "Failed to update role",
          description:
            err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [updateMutation, workspaceId, toast],
  );

  const handleRemove = React.useCallback(
    async (memberId: string) => {
      try {
        await removeMutation.mutateAsync({ workspaceId, memberId });
        toast({ title: "Member removed" });
      } catch (err) {
        toast({
          title: "Failed to remove member",
          description:
            err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [removeMutation, workspaceId, toast],
  );

  return (
    <div className={cn("space-y-4", className)}>
      <header className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            Members
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {membersQuery.data?.length ?? 0} member(s)
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <UserPlus className="size-3.5" aria-hidden="true" />
              Invite
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a member</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                aria-label="Email"
              />
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as WorkspaceRole)}
              >
                <SelectTrigger className="w-full" aria-label="Role">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  !inviteEmail.includes("@") || inviteMutation.isPending
                }
                onClick={handleInvite}
              >
                {inviteMutation.isPending ? "Sending…" : "Send invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {membersQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : membersQuery.isError ? (
        <EmptyState
          icon={Users}
          title="Couldn't load members"
          description="Please try again."
        />
      ) : (membersQuery.data ?? []).length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          description="Invite your first teammate to start collaborating."
        />
      ) : (
        <ul className="space-y-1.5">
          {membersQuery.data!.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-md border p-2.5"
            >
              <Avatar className="size-9">
                <AvatarFallback className="bg-muted text-xs">
                  {initialsFromUuid(m.user_id)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  <code className="font-mono text-xs">{m.user_id.slice(0, 8)}</code>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  joined{" "}
                  {new Date(m.joined_at ?? m.created_at).toLocaleDateString()}
                </p>
              </div>
              <Select
                value={m.role}
                onValueChange={(v) => handleRoleChange(m.id, v as WorkspaceRole)}
              >
                <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant={ROLE_VARIANT[m.role]} className="text-[10px]">
                {ROLE_LABEL[m.role]}
              </Badge>
              {m.role !== "owner" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                  disabled={removeMutation.isPending}
                  onClick={() => handleRemove(m.id)}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
