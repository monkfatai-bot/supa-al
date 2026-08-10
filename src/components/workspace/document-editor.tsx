"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Star,
  Download,
  Copy,
  Archive,
  Trash2,
  History,
  Sparkles,
  Bold,
  Italic,
  Heading,
  ListOrdered,
  Code,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  getDocument,
  updateDocument,
  getVersionHistory,
  restoreVersion,
  toggleFavorite,
  exportDocument,
  duplicateDocument,
  archiveDocument,
  deleteDocument,
  aiDocumentAssistant,
} from "@/services/document";
import type { DocumentWithCreator, DocumentVersionWithCreator, AiAssistantAction } from "@/services/document";
interface DocumentEditorProps {
  documentId: string;
  workspaceId: string;
}

const AI_ACTIONS: { action: AiAssistantAction; label: string; icon: string }[] = [
  { action: "rewrite", label: "Rewrite", icon: "✨" },
  { action: "expand", label: "Expand", icon: "📝" },
  { action: "summarize", label: "Summarize", icon: "📋" },
  { action: "translate", label: "Translate", icon: "🌐" },
  { action: "improve_grammar", label: "Improve Grammar", icon: "✅" },
  { action: "generate_title", label: "Generate Title", icon: "💡" },
  { action: "create_outline", label: "Create Outline", icon: "📑" },
  { action: "continue_writing", label: "Continue Writing", icon: "➡️" },
  { action: "explain", label: "Explain", icon: "📖" },
];

function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

export function DocumentEditor({ documentId, workspaceId: _workspaceId }: DocumentEditorProps) {
  const [docData, setDocData] = useState<DocumentWithCreator | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [versions, setVersions] = useState<DocumentVersionWithCreator[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchDocument = useCallback(() => {
    getDocument(documentId).then((res) => {
      if (res.success && res.document) {
        setDocData(res.document);
        setTitle(res.document.title);
        setContent(res.document.content ?? "");
      }
    });
  }, [documentId]);

  const fetchVersions = useCallback(() => {
    getVersionHistory(documentId).then((res) => {
      if (res.success && res.versions) setVersions(res.versions);
    });
  }, [documentId]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  useEffect(() => {
    if (showVersions) fetchVersions();
  }, [showVersions, fetchVersions]);

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setIsSaving(true);
      updateDocument(documentId, { title, content }).then((res) => {
        if (res.success) {
          setSaveStatus("Saved");
          setTimeout(() => setSaveStatus(""), 2000);
        }
        setIsSaving(false);
      });
    }, 2000);
  }, [documentId, title, content]);

  function handleTitleBlur() {
    debouncedSave();
  }

  function handleContentChange(value: string) {
    setContent(value);
    debouncedSave();
  }

  function insertMarkdown(syntax: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.substring(start, end);
    const newText = content.substring(0, start) + syntax + (selected || "text") + syntax + content.substring(end);
    setContent(newText);
    ta.focus();
  }

  function handleAiAction(action: AiAssistantAction) {
    if (!content.trim()) return;
    setAiLoading(true);
    aiDocumentAssistant(content, action).then((res) => {
      if (res.success && res.result) {
        if (action === "generate_title") {
          const lines = res.result.split("\n").filter((l) => l.trim());
          if (lines.length > 0) setTitle(lines[0].replace(/^[\d.]\s*/, "").trim());
        } else if (action === "continue_writing") {
          setContent(content + "\n\n" + res.result);
        } else {
          setContent(res.result);
        }
        debouncedSave();
      }
      setAiLoading(false);
    });
  }

  function handleExport(format: "markdown" | "text" | "json") {
    exportDocument(documentId, format).then((res) => {
      if (res.success && res.content && res.filename) {
        const blob = new Blob([res.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  }

  if (!docData) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading document...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-2">
            <Select
              value={docData.document_type}
              onValueChange={(v) => updateDocument(documentId, { document_type: v })}
            >
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rich_text">Rich Text</SelectItem>
                <SelectItem value="markdown">Markdown</SelectItem>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="report">Report</SelectItem>
                <SelectItem value="proposal">Proposal</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant={docData.status === "published" ? "default" : "outline"} className="text-xs">
              {docData.status}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => toggleFavorite(documentId).then(fetchDocument)}
            >
              <Star className={docData.is_favorite ? "h-4 w-4 fill-yellow-500 text-yellow-500" : "h-4 w-4"} />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowVersions(!showVersions)}>
              <History className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowAiPanel(!showAiPanel)}>
              <Sparkles className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport("markdown")}>Markdown (.md)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("text")}>Plain Text (.txt)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")}>JSON (.json)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8">
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => duplicateDocument(documentId).then(fetchDocument)}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => archiveDocument(documentId).then(fetchDocument)}>
                  <Archive className="mr-2 h-4 w-4" /> Archive
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => deleteDocument(documentId)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Title */}
        <div className="border-b px-6 py-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="w-full text-2xl font-bold outline-none bg-transparent placeholder:text-muted-foreground"
            placeholder="Untitled Document"
          />
        </div>

        {/* Markdown Toolbar */}
        <div className="flex items-center gap-1 border-b px-4 py-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown("**")}>
            <Bold className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown("*")}>
            <Italic className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown("## ")}>
            <Heading className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown("1. ")}>
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown("`")}>
            <Code className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown("> ")}>
            <Quote className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <span className="text-muted-foreground text-xs">
            {countWords(content)} words · {content.length} chars
          </span>
          <span className="ml-auto text-xs">
            {isSaving ? "Saving..." : saveStatus ? `✓ ${saveStatus}` : ""}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="min-h-full resize-none border-0 p-6 text-sm focus-visible:ring-0"
            placeholder="Start writing..."
          />
        </div>
      </div>

      {/* Version History Sidebar */}
      {showVersions && (
        <div className="w-72 shrink-0 border-l">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Version History</h3>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowVersions(false)}>
              Close
            </Button>
          </div>
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-2 p-3">
              {versions.map((ver) => (
                <div key={ver.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs">v{ver.version_number}</Badge>
                    <span className="text-muted-foreground text-xs">
                      {new Date(ver.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm">{ver.title}</p>
                  {ver.change_summary && (
                    <p className="text-muted-foreground mt-1 text-xs">{ver.change_summary}</p>
                  )}
                  <div className="mt-2 flex items-center gap-1">
                    <span className="text-muted-foreground text-xs">{ver.word_count} words</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto h-6 text-xs"
                      onClick={() => restoreVersion(ver.id).then(fetchDocument)}
                    >
                      Restore
                    </Button>
                  </div>
                </div>
              ))}
              {versions.length === 0 && (
                <p className="text-muted-foreground p-4 text-center text-xs">No versions yet.</p>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* AI Assistant Sidebar */}
      {showAiPanel && (
        <div className="w-64 shrink-0 border-l">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">AI Assistant</h3>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAiPanel(false)}>
              Close
            </Button>
          </div>
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-1 p-2">
              {AI_ACTIONS.map((item) => (
                <Button
                  key={item.action}
                  variant="ghost"
                  className="w-full justify-start gap-2 text-sm"
                  size="sm"
                  disabled={aiLoading}
                  onClick={() => handleAiAction(item.action)}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
