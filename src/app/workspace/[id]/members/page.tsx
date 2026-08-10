"use client";

import { useParams } from "next/navigation";
import { MemberManager } from "@/components/workspace/member-manager";

export default function MembersPage() {
  const params = useParams<{ id: string }>();
  return <MemberManager workspaceId={params.id} />;
}
