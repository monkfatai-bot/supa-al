"use client";

import { useState } from "react";
import {
  Search,
  FileText,
  Folder,
  File,
  BookOpen,
  Users,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { globalSearch } from "@/services/search";
import type { SearchResultItem, SearchFilters } from "@/services/search";

interface SearchPanelProps {
  workspaceId: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  document: <FileText className="h-4 w-4 text-blue-500" />,
  folder: <Folder className="h-4 w-4 text-amber-500" />,
  file: <File className="h-4 w-4 text-gray-500" />,
  knowledge: <BookOpen className="h-4 w-4 text-emerald-500" />,
  member: <Users className="h-4 w-4 text-purple-500" />,
};

const TYPE_LABELS: Record<string, string> = {
  document: "Document",
  folder: "Folder",
  file: "File",
  knowledge: "Knowledge",
  member: "Member",
};

export function SearchPanel({ workspaceId }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    "document", "folder", "file", "knowledge", "member",
  ]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  function toggleType(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  function handleSearch() {
    if (!query.trim() || selectedTypes.length === 0) return;
    setIsSearching(true);
    setHasSearched(true);
    const filters: SearchFilters = {
      workspace_id: workspaceId,
      query: query.trim(),
      types: selectedTypes,
    };
    globalSearch(filters).then((res) => {
      if (res.success && res.results) setResults(res.results);
      setIsSearching(false);
    });
  }

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-2.5 h-4 w-4" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="Search everything..."
            className="pl-10"
          />
          {query && (
            <button
              type="button"
              className="text-muted-foreground absolute right-3 top-2.5 hover:text-foreground"
              onClick={() => { setQuery(""); setResults([]); setHasSearched(false); }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button onClick={handleSearch} disabled={isSearching}>
          {isSearching ? "Searching..." : "Search"}
        </Button>
      </div>

      {/* Type Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(["document", "folder", "file", "knowledge", "member"] as const).map((type) => (
          <Button
            key={type}
            variant={selectedTypes.includes(type) ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => toggleType(type)}
          >
            {TYPE_ICONS[type]}
            {TYPE_LABELS[type]}
          </Button>
        ))}
      </div>

      {/* Results */}
      {hasSearched && (
        <ScrollArea className="max-h-[500px]">
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              {results.length} result{results.length !== 1 ? "s" : ""} found
            </p>
            {results.map((item) => (
              <Card key={`${item.type}-${item.id}`} className="cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    {TYPE_ICONS[item.type] ?? <File className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.description && (
                      <p className="text-muted-foreground line-clamp-1 text-xs">{item.description}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {TYPE_LABELS[item.type] ?? item.type}
                  </Badge>
                </CardContent>
              </Card>
            ))}
            {results.length === 0 && !isSearching && (
              <div className="flex flex-col items-center justify-center py-8">
                <Search className="text-muted-foreground h-8 w-8" />
                <p className="text-muted-foreground mt-2 text-sm">No results found.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
