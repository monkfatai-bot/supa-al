"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  getActiveWorkspaceId,
  getWorkspace,
  getWorkspaces,
  switchActiveWorkspace,
} from "@/services/workspace";
import type { WorkspaceWithMemberCount } from "@/services/workspace";

const BREADCRUMB_LABELS: Record<string, string> = {
  documents: "Documents",
  files: "Files",
  knowledge: "Knowledge Base",
  members: "Members",
  settings: "Settings",
  search: "Search",
};

export function WorkspaceHeader() {
  const pathname = usePathname();
  const [workspaceName, setWorkspaceName] = useState<string>("Workspace");
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMemberCount[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;
    let cancelled = false;
    getActiveWorkspaceId().then((wid) => {
      if (cancelled) return;
      if (wid) {
        setActiveId(wid);
        getWorkspace(wid).then((res) => {
          if (cancelled) return;
          if (res.success && res.workspace) {
            setWorkspaceName(res.workspace.name);
          }
        });
      }
      getWorkspaces().then((wsList) => {
        if (cancelled) return;
        setWorkspaces(wsList);
      });
    });
    return () => { cancelled = true; };
  }, []);

  function handleSwitch(id: string) {
    switchActiveWorkspace(id).then((res) => {
      if (res.success) {
        setActiveId(id);
        const target = workspaces.find((w) => w.id === id);
        if (target) setWorkspaceName(target.name);
      }
    });
  }

  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.slice(1).map((seg) => {
    const label = BREADCRUMB_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
    const href = "/" + segments.slice(0, segments.indexOf(seg) + 1).join("/");
    return { label, href };
  });

  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2 font-semibold">
              {workspaceName}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {workspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => handleSwitch(ws.id)}
                className={ws.id === activeId ? "bg-accent" : ""}
              >
                <span className="flex-1 truncate">{ws.name}</span>
                <span className="text-muted-foreground text-xs">
                  {ws.member_count} member{ws.member_count !== 1 ? "s" : ""}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {breadcrumbs.length > 0 && (
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Home</BreadcrumbLink>
              </BreadcrumbItem>
              {breadcrumbs.map((crumb, idx) => (
                <span key={crumb.href} className="flex items-center gap-1.5">
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {idx === breadcrumbs.length - 1 ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </span>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>
    </header>
  );
}
