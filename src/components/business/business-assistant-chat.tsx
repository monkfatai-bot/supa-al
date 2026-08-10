"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Sparkles, FileText, ScrollText, File, BarChart3, TrendingUp, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  handleBusinessAssistant,
  generateInvoiceWithAi,
  generateProposalWithAi,
  writeContractWithAi,
  analyzeSales,
  generateExecutiveSummary,
} from "@/services/business-assistant/actions";
import type { BusinessAssistantResponse } from "@/services/business-assistant/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ── Quick Actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Generate Invoice", action: "generate_invoice", icon: FileText, color: "text-emerald-600" },
  { label: "Create Contract", action: "write_contract", icon: ScrollText, color: "text-amber-600" },
  { label: "Draft Proposal", action: "generate_proposal", icon: File, color: "text-purple-600" },
  { label: "Financial Summary", action: "executive_summary", icon: BarChart3, color: "text-blue-600" },
  { label: "Sales Report", action: "analyze_sales", icon: TrendingUp, color: "text-orange-600" },
] as const;

// ── Simple markdown to HTML ──────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3 class=\"text-base font-semibold mt-4 mb-2\">$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 class=\"text-lg font-semibold mt-4 mb-2\">$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 class=\"text-xl font-bold mt-4 mb-2\">$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li class=\"ml-4 list-disc\">$1</li>")
    .replace(/^\* (.+)$/gm, "<li class=\"ml-4 list-disc\">$1</li>")
    .replace(/\n/g, "<br />");
}

// ── Props ────────────────────────────────────────────────────────────────────

interface BusinessAssistantChatProps {
  workspaceId: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BusinessAssistantChat({ workspaceId }: BusinessAssistantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Send generic chat message ────────────────────────────────────────
  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res: BusinessAssistantResponse = await handleBusinessAssistant({
        workspaceId,
        action: "generate_report",
        prompt: text,
      });

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.success ? res.content : `Error: ${res.error ?? res.content}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  // ── Quick action handler ─────────────────────────────────────────────
  async function handleQuickAction(action: string, label: string) {
    if (loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: label,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      let res: BusinessAssistantResponse;

      switch (action) {
        case "generate_invoice":
          res = await generateInvoiceWithAi(workspaceId, { customerName: "Quick Client", items: ["Consulting services"] });
          break;
        case "write_contract":
          res = await writeContractWithAi(workspaceId, { contractType: "service", description: "Standard service agreement for professional consulting" });
          break;
        case "generate_proposal":
          res = await generateProposalWithAi(workspaceId, { customerName: "Prospect", description: "Professional consulting services proposal", type: "business" });
          break;
        case "executive_summary":
          res = await generateExecutiveSummary(workspaceId);
          break;
        case "analyze_sales":
          res = await analyzeSales(workspaceId);
          break;
        default:
          res = await handleBusinessAssistant({ workspaceId, action: "generate_report" as BusinessAssistantResponse["action"], prompt: label });
      }

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.success ? res.content : `Error: ${res.error ?? res.content}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">AI Business Assistant</h2>
        <p className="text-muted-foreground text-sm">Ask questions about your business or use quick actions.</p>
      </div>

      {/* Quick Actions */}
      {messages.length === 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="text-amber-500 h-4 w-4" />
              <span className="text-sm font-medium">Quick Actions</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((qa) => (
                <Button
                  key={qa.action}
                  variant="outline"
                  size="sm"
                  className={`${qa.color} gap-1.5`}
                  onClick={() => handleQuickAction(qa.action, qa.label)}
                  disabled={loading}
                >
                  <qa.icon className="h-3.5 w-3.5" />
                  {qa.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chat Messages */}
      <Card className="flex flex-1 overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="bg-primary/10 text-primary mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                <Bot className="h-6 w-6" />
              </div>
              <h3 className="mb-1 font-medium">Business Assistant</h3>
              <p className="text-muted-foreground max-w-sm text-sm">
                Ask about invoices, sales, expenses, or use the quick actions above to get started.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-3">
                    <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                    <span className="text-muted-foreground text-sm">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about your business..."
              rows={1}
              className="min-h-[40px] max-h-[120px] resize-none"
              disabled={loading}
            />
            <Button
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
