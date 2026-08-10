"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  Shield,
  Crown,
  UserCog,
  Eye,
  Trash2,
  Mail,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getWorkspaceMembers,
  updateMemberRole,
  removeMember,
  inviteMember,
  getInvitations,
} from "@/services/workspace";
import type { MemberWithProfile, WorkspaceInvitation } from "@/services/workspace";

interface MemberManagerProps {
  workspaceId: string;
}

function getRoleIcon(role: string) {
  switch (role) {
    case "owner":
      return <Crown className="h-4 w-4 text-yellow-500" />;
    case "admin":
      return <Shield className="h-4 w-4 text-orange-500" />;
    case "member":
      return <UserCog className="h-4 w-4 text-blue-500" />;
    case "guest":
      return <Eye className="h-4 w-4 text-gray-500" />;
    default:
      return <Users className="h-4 w-4" />;
  }
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" | "destructive" {
  switch (role) {
    case "owner":
      return "default";
    case "admin":
      return "secondary";
    default:
      return "outline";
  }
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function MemberManager({ workspaceId }: MemberManagerProps) {
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [isInviting, setIsInviting] = useState(false);

  const fetchData = useCallback(() => {
    getWorkspaceMembers(workspaceId).then((data) => setMembers(data));
    getInvitations(workspaceId).then((data) => setInvitations(data));
  }, [workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleRoleChange(userId: string, newRole: string) {
    updateMemberRole(workspaceId, userId, newRole).then((res) => {
      if (res.success) fetchData();
    });
  }

  function handleRemove(userId: string) {
    removeMember(workspaceId, userId).then((res) => {
      if (res.success) fetchData();
    });
  }

  function handleInvite() {
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    inviteMember(workspaceId, inviteEmail.trim(), inviteRole).then((res) => {
      if (res.success) {
        setInviteEmail("");
        setInviteRole("member");
        fetchData();
      }
      setIsInviting(false);
    });
  }

  return (
    <div className="space-y-6">
      {/* Invite Member */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-5 w-5" />
            Invite Member
          </CardTitle>
          <CardDescription>Send an invitation to join this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] space-y-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
              />
            </div>
            <div className="w-36 space-y-1">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="guest">Guest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleInvite} disabled={isInviting || !inviteEmail.trim()}>
              <Mail className="mr-2 h-4 w-4" />
              {isInviting ? "Sending..." : "Invite"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-48">
              <div className="space-y-2">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Mail className="text-muted-foreground h-4 w-4" />
                      <div>
                        <p className="text-sm font-medium">{inv.email}</p>
                        <p className="text-muted-foreground text-xs">
                          Invited as {inv.role} · {formatDate(inv.created_at)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">{inv.status}</Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" />
            Team Members ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-96">
            <div className="space-y-2">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={member.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">{getInitials(member.full_name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{member.full_name ?? "Unknown"}</p>
                      <p className="text-muted-foreground text-xs">Joined {formatDate(member.joined_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      {getRoleIcon(member.role)}
                      {member.role === "owner" ? (
                        <Badge variant={getRoleBadgeVariant(member.role)} className="text-xs">
                          {member.role}
                        </Badge>
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(v) => handleRoleChange(member.user_id, v)}
                        >
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="guest">Guest</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {member.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleRemove(member.user_id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
