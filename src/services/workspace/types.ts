import type { Workspace, WorkspaceMember, WorkspaceInvitation } from '@/types/generated/database';

export interface WorkspaceActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface GetWorkspaceResponse extends WorkspaceActionResponse {
  workspace?: Workspace;
}

export interface WorkspaceWithMemberCount extends Workspace {
  member_count: number;
}

export interface MemberWithProfile extends WorkspaceMember {
  full_name: string | null;
  avatar_url: string | null;
}

export type { Workspace, WorkspaceMember, WorkspaceInvitation };
