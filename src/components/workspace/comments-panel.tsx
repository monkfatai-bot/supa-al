"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquare, Reply, Check, Trash2, AtSign } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  getComments,
  createComment,
  resolveComment,
  deleteComment,
} from "@/services/comment";
import { getWorkspaceMembers } from "@/services/workspace";
import type { CommentWithAuthor } from "@/services/comment";
import type { MemberWithProfile } from "@/services/workspace";
import { cn } from "@/lib/utils";

interface CommentsPanelProps {
  documentId: string;
  workspaceId: string;
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

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function CommentItem({
  comment,
  members,
  workspaceId,
  documentId,
  allComments,
  onReply,
  onRefresh,
}: {
  comment: CommentWithAuthor;
  members: MemberWithProfile[];
  workspaceId: string;
  documentId: string;
  allComments: CommentWithAuthor[];
  onReply: (commentId: string) => void;
  onRefresh: () => void;
}) {
  const replies = allComments.filter((c) => c.parent_id === comment.id);

  return (
    <div className="space-y-2">
      <div className={cn("rounded-lg border p-3", comment.status === "resolved" && "opacity-60")}>
        <div className="flex items-start gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={comment.author_avatar ?? undefined} />
            <AvatarFallback className="text-xs">{getInitials(comment.author_name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{comment.author_name ?? "Unknown"}</span>
              <span className="text-muted-foreground text-xs">{formatTime(comment.created_at)}</span>
              {comment.status === "resolved" && (
                <Badge variant="secondary" className="text-xs">Resolved</Badge>
              )}
            </div>
            <p className="mt-1 text-sm whitespace-pre-wrap">{comment.content}</p>
            <div className="mt-2 flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onReply(comment.id)}>
                <Reply className="mr-1 h-3 w-3" /> Reply
              </Button>
              {comment.status === "active" && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => resolveComment(comment.id).then(onRefresh)}>
                  <Check className="mr-1 h-3 w-3" /> Resolve
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => deleteComment(comment.id).then(onRefresh)}>
                <Trash2 className="mr-1 h-3 w-3" /> Delete
              </Button>
            </div>
          </div>
        </div>
      </div>
      {replies.length > 0 && (
        <div className="ml-4 border-l-2 pl-4">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              members={members}
              workspaceId={workspaceId}
              documentId={documentId}
              allComments={allComments}
              onReply={() => {}}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CommentsPanel({ documentId, workspaceId }: CommentsPanelProps) {
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchComments = useCallback(() => {
    getComments(documentId).then((res) => {
      if (res.success && res.comments) setComments(res.comments);
    });
  }, [documentId]);

  const fetchMembers = useCallback(() => {
    getWorkspaceMembers(workspaceId).then((data) => setMembers(data));
  }, [workspaceId]);

  useEffect(() => {
    fetchComments();
    fetchMembers();
  }, [fetchComments, fetchMembers]);

  function handlePostComment() {
    if (!newComment.trim()) return;
    createComment({
      workspace_id: workspaceId,
      document_id: documentId,
      content: newComment.trim(),
    }).then(() => {
      setNewComment("");
      fetchComments();
    });
  }

  function handlePostReply() {
    if (!replyText.trim() || !replyTo) return;
    createComment({
      workspace_id: workspaceId,
      document_id: documentId,
      parent_id: replyTo,
      content: replyText.trim(),
    }).then(() => {
      setReplyTo(null);
      setReplyText("");
      fetchComments();
    });
  }

  const rootComments = comments.filter((c) => !c.parent_id);
  const filteredMembers = mentionQuery
    ? members.filter((m) => m.full_name?.toLowerCase().includes(mentionQuery.toLowerCase()))
    : members;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Comments ({comments.length})</h3>
      </div>

      <div className="border-b p-4">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={newComment}
            onChange={(e) => {
              setNewComment(e.target.value);
              const val = e.target.value;
              const cursorPos = e.target.selectionStart;
              const beforeCursor = val.substring(0, cursorPos);
              const atMatch = beforeCursor.match(/@(\w*)$/);
              if (atMatch) {
                setMentionQuery(atMatch[1]);
                setShowMentions(true);
              } else {
                setShowMentions(false);
              }
            }}
            placeholder="Add a comment..."
            className="min-h-[80px] resize-none text-sm"
          />
          {showMentions && filteredMembers.length > 0 && (
            <div className="absolute bottom-14 left-2 z-10 w-48 rounded-md border bg-popover p-1 shadow-md">
              {filteredMembers.slice(0, 5).map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                  onClick={() => {
                    const val = newComment;
                    const cursorPos = textareaRef.current?.selectionStart ?? val.length;
                    const beforeCursor = val.substring(0, cursorPos);
                    const newBefore = beforeCursor.replace(/@\w*$/, `@${m.full_name ?? m.user_id} `);
                    setNewComment(newBefore + val.substring(cursorPos));
                    setShowMentions(false);
                    textareaRef.current?.focus();
                  }}
                >
                  <AtSign className="h-3 w-3 text-muted-foreground" />
                  <span>{m.full_name ?? "Unknown"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-2 flex justify-end">
          <Button size="sm" disabled={!newComment.trim()} onClick={handlePostComment}>
            Post Comment
          </Button>
        </div>
      </div>

      {replyTo && (
        <div className="border-b p-3 bg-muted/30">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply..."
            className="min-h-[60px] resize-none text-sm"
            autoFocus
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReplyTo(null)}>Cancel</Button>
            <Button size="sm" disabled={!replyText.trim()} onClick={handlePostReply}>Reply</Button>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {rootComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              members={members}
              workspaceId={workspaceId}
              documentId={documentId}
              allComments={comments}
              onReply={setReplyTo}
              onRefresh={fetchComments}
            />
          ))}
          {comments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8">
              <MessageSquare className="text-muted-foreground h-8 w-8" />
              <p className="text-muted-foreground mt-2 text-sm">No comments yet.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
