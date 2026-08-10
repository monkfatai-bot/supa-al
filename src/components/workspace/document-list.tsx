"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutGrid,
  List,
  Star,
  MoreHorizontal,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getDocuments,
  toggleFavorite,
  deleteDocument,
} from "@/services/document";
import type { DocumentWithCreator } from "@/services/document";

interface DocumentListProps {
  workspaceId: string;
  folderId: string | null;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DocumentList({ workspaceId, folderId }: DocumentListProps) {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentWithCreator[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const fetchDocuments = useCallback(() => {
    const filters: Record<string, unknown> = {
      workspace_id: workspaceId,
      sort_by: "updated_at",
      sort_order: "desc",
    };
    if (folderId !== null) filters.folder_id = folderId;
    if (search.trim()) filters.search = search.trim();
    if (typeFilter !== "all") filters.document_type = typeFilter;
    if (statusFilter !== "all") filters.status = statusFilter;

    getDocuments({ filters, page: 1, page_size: 50 }).then((res) => {
      if (res.success && res.documents) setDocuments(res.documents);
    });
  }, [workspaceId, folderId, search, typeFilter, statusFilter]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  function handleToggleFavorite(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    toggleFavorite(id).then(() => fetchDocuments());
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    deleteDocument(id).then(() => fetchDocuments());
  }

  function handleClick(docId: string) {
    router.push(`/workspace/${workspaceId}/documents/${docId}`);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="rich_text">Rich Text</SelectItem>
            <SelectItem value="markdown">Markdown</SelectItem>
            <SelectItem value="note">Note</SelectItem>
            <SelectItem value="report">Report</SelectItem>
            <SelectItem value="proposal">Proposal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center rounded-md border">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9 rounded-r-none"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9 rounded-l-none"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Document Grid/List */}
      {viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <Card
              key={doc.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => handleClick(doc.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold">{doc.title}</h4>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                      {doc.content.slice(0, 100) || "No content"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleToggleFavorite(doc.id, e)}
                      className="text-muted-foreground hover:text-yellow-500"
                    >
                      <Star className={doc.is_favorite ? "h-4 w-4 fill-yellow-500 text-yellow-500" : "h-4 w-4"} />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); handleDelete(doc.id, e as unknown as React.MouseEvent); }}
                          className="text-destructive"
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {doc.document_type}
                    </Badge>
                    <Badge
                      variant={doc.status === "published" ? "default" : "outline"}
                      className="text-xs"
                    >
                      {doc.status}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground text-xs">{formatTime(doc.updated_at)}</span>
                </div>
                <p className="text-muted-foreground mt-2 text-xs">{doc.word_count} words</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card
              key={doc.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => handleClick(doc.id)}
            >
              <CardContent className="flex items-center justify-between p-3">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-semibold">{doc.title}</h4>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {doc.document_type}
                    </Badge>
                    <Badge
                      variant={doc.status === "published" ? "default" : "outline"}
                      className="text-xs"
                    >
                      {doc.status}
                    </Badge>
                    <span className="text-muted-foreground text-xs">{doc.word_count} words</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">{formatTime(doc.updated_at)}</span>
                  <button
                    type="button"
                    onClick={(e) => handleToggleFavorite(doc.id, e)}
                    className="text-muted-foreground hover:text-yellow-500"
                  >
                    <Star className={doc.is_favorite ? "h-4 w-4 fill-yellow-500 text-yellow-500" : "h-4 w-4"} />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {documents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Search className="text-muted-foreground h-10 w-10" />
          <p className="text-muted-foreground mt-4 text-sm">No documents found.</p>
        </div>
      )}
    </div>
  );
}
