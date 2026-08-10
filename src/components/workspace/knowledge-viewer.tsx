"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getKnowledgeEntries,
  createKnowledgeEntry,
  searchKnowledge,
} from "@/services/knowledge-base";
import type { KnowledgeWithCreator } from "@/services/knowledge-base";
import type { KnowledgeEntryType } from "@/types/generated/database";

interface KnowledgeViewerProps {
  workspaceId: string;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function KnowledgeViewer({ workspaceId }: KnowledgeViewerProps) {
  const [entries, setEntries] = useState<KnowledgeWithCreator[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newType, setNewType] = useState<KnowledgeEntryType>("article");
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchEntries = useCallback(() => {
    const filters: Record<string, unknown> = { workspace_id: workspaceId };
    if (categoryFilter !== "all") filters.category = categoryFilter;
    if (typeFilter !== "all") filters.entry_type = typeFilter;
    if (search.trim()) filters.search = search.trim();

    getKnowledgeEntries(filters, 1, 50).then((res) => {
      if (res.success && res.entries) setEntries(res.entries);
    });
  }, [workspaceId, categoryFilter, typeFilter, search]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  function handleSearch() {
    if (!search.trim()) {
      fetchEntries();
      return;
    }
    searchKnowledge(workspaceId, search.trim()).then((res) => {
      if (res.success && res.results) {
        const mapped: KnowledgeWithCreator[] = res.results.map((r) => ({
          ...r,
          creator_name: null,
          is_indexed: false,
          updated_by: "",
          linked_document_ids: [],
          source_urls: [],
        })) as KnowledgeWithCreator[];
        setEntries(mapped);
      }
    });
  }

  function handleCreate() {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    createKnowledgeEntry(workspaceId, {
      title: newTitle.trim(),
      content: newContent.trim(),
      entry_type: newType,
      category: newCategory.trim() || undefined,
    }).then((res) => {
      if (res.success) {
        setNewTitle("");
        setNewContent("");
        setNewCategory("");
        setNewType("article");
        setDialogOpen(false);
        fetchEntries();
      }
      setIsCreating(false);
    });
  }

  const categories = [...new Set(entries.map((e) => e.category).filter(Boolean))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="Search knowledge base..."
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={handleSearch}>Search</Button>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat!}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="article">Article</SelectItem>
            <SelectItem value="faq">FAQ</SelectItem>
            <SelectItem value="reference">Reference</SelectItem>
            <SelectItem value="guide">Guide</SelectItem>
            <SelectItem value="policy">Policy</SelectItem>
            <SelectItem value="note">Note</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Knowledge Entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Entry title" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={newType} onValueChange={(v) => setNewType(v as KnowledgeEntryType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="article">Article</SelectItem>
                      <SelectItem value="faq">FAQ</SelectItem>
                      <SelectItem value="reference">Reference</SelectItem>
                      <SelectItem value="guide">Guide</SelectItem>
                      <SelectItem value="policy">Policy</SelectItem>
                      <SelectItem value="note">Note</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Engineering" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="Knowledge content..." className="min-h-[150px]" />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleCreate} disabled={isCreating || !newTitle.trim()}>
                  {isCreating ? "Creating..." : "Create Entry"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <Card key={entry.id} className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-semibold leading-tight">{entry.title}</CardTitle>
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  className="text-muted-foreground shrink-0"
                >
                  {expandedId === entry.id ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{entry.entry_type}</Badge>
                {entry.category && (
                  <Badge variant="outline" className="text-xs">{entry.category}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {expandedId === entry.id ? (
                <div className="space-y-2">
                  <p className="text-sm whitespace-pre-wrap">{entry.content}</p>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <span>By {entry.creator_name ?? "Unknown"}</span>
                    <span>·</span>
                    <span>{formatTime(entry.updated_at)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground line-clamp-2 text-xs">{entry.content.slice(0, 150) || "No content"}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <BookOpen className="text-muted-foreground h-10 w-10" />
          <p className="text-muted-foreground mt-4 text-sm">No knowledge entries found.</p>
        </div>
      )}
    </div>
  );
}
