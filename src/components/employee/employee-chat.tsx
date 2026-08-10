"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Bot, User, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  sendEmployeeMessage,
  getEmployeeMessages,
  getEmployee,
} from "@/services/employee";
import type { EmployeeMessage, EmployeeWithSkills } from "@/services/employee";
import { useToast } from "@/hooks/use-toast";

// ── Props ─────────────────────────────────────────────────────────────

interface EmployeeChatProps {
  employeeId: string;
  workspaceId: string;
}

// ── Component ──────────────────────────────────────────────────────────

export function EmployeeChat({ employeeId, workspaceId }: EmployeeChatProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<EmployeeMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<EmployeeWithSkills | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationId = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const empRes = await getEmployee(employeeId);
      if (empRes.employee) {
        setEmployee(empRes.employee);
        // Generate a conversation ID based on user + employee
        conversationId.current = `user-${employeeId}`;
        const msgRes = await getEmployeeMessages(conversationId.current);
        if (msgRes.messages) setMessages(msgRes.messages);
      } else {
        toast({ title: "Error", description: "Employee not found", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to load chat", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [employeeId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !conversationId.current) return;
    setSending(true);

    const content = newMessage.trim();
    setNewMessage("");

    // Optimistically add user message
    const optimisticMsg: EmployeeMessage = {
      id: `temp-${Date.now()}`,
      sender_id: "user",
      recipient_id: employeeId,
      workspace_id: workspaceId,
      conversation_id: conversationId.current,
      content,
      metadata: {},
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const result = await sendEmployeeMessage("user", employeeId, content, workspaceId);
      if (result.success && result.msg) {
        setMessages((prev) => [...prev, result.msg!]);
      } else {
        toast({ title: "Error", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const emp = employee?.employee;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-3/4" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[500px]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary">
              <Bot className="size-5" />
            </AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-base">{emp?.name ?? "AI Employee"}</CardTitle>
            <p className="text-xs text-muted-foreground">{emp?.role ?? ""}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <Bot className="size-12 text-muted-foreground mb-3" />
              <h3 className="font-medium">Chat with {emp?.name}</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Send a message to start a conversation with this AI employee.
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {messages.map((msg) => {
                const isUser = msg.sender_id === "user";
                return (
                  <div key={msg.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                    {!isUser && (
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <Bot className="size-3.5" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className={`max-w-[70%] rounded-lg px-4 py-2.5 ${
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      <p className="text-sm">{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${isUser ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {isUser && (
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="bg-muted">
                          <User className="size-3.5" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                );
              })}
              {sending && (
                <div className="flex gap-3 justify-start">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <Bot className="size-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg px-4 py-2.5">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={sending}
          />
          <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </Card>
  );
}
