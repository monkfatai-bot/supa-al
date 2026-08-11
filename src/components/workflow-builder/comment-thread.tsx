'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  MessageSquare,
  Reply,
  Trash2,
  Loader2,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import {
  getWorkflowComments,
  addWorkflowComment,
  deleteWorkflowComment,
} from '@/services/workflow-builder/actions';
import type { WorkflowCommentWithAuthor } from '@/services/workflow-builder/types';

// ─── Props ──────────────────────────────────────────────

interface CommentThreadProps {
  workflowId: string;
  nodeId?: string;
}

// ─── Helpers ────────────────────────────────────────────

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ─── Reply Input ────────────────────────────────────────

interface ReplyInputProps {
  workflowId: string;
  parentId?: string;
  onSubmit: () => void;
}

function ReplyInput({ workflowId, parentId, onSubmit }: ReplyInputProps) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const result = await addWorkflowComment(workflowId, trimmed, undefined, parentId);
      if (result.success) {
        setValue('');
        onSubmit();
      } else {
        toast.error('Failed to post comment', { description: result.error });
      }
    } catch {
      toast.error('Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  }, [value, submitting, workflowId, parentId, onSubmit]);

  return (
    <div className="flex items-center gap-1.5 py-1 ml-6">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Write a reply..."
        className="h-7 text-xs"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        disabled={submitting}
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={handleSubmit}
        disabled={submitting || !value.trim()}
      >
        {submitting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Send className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

// ─── Single Comment ─────────────────────────────────────

interface CommentItemProps {
  comment: WorkflowCommentWithAuthor;
  currentUserId: string | undefined;
  onReply: (parentId: string) => void;
  onDelete: (commentId: string) => void;
  replyingTo: string | null;
}

function CommentItem({ comment, currentUserId, onReply, onDelete, replyingTo }: CommentItemProps) {
  const isOwn = comment.user_id === currentUserId;

  return (
    <div className="group">
      <div className="flex gap-2.5 py-2">
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarImage src={comment.author?.avatar_url ?? undefined} alt={comment.author?.full_name ?? ''} />
          <AvatarFallback className="text-[10px]">
            {getInitials(comment.author?.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium truncate">
              {comment.author?.full_name ?? 'Unknown'}
            </span>
            <span className="text-[11px] text-muted-foreground">{formatTime(comment.created_at)}</span>
            {comment.is_resolved && (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            )}
          </div>
          <p className="text-xs text-foreground/90 mt-0.5 whitespace-pre-wrap break-words">
            {comment.content}
          </p>
          <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] gap-1"
              onClick={() => onReply(comment.id)}
            >
              <Reply className="h-2.5 w-2.5" />
              Reply
            </Button>
            {isOwn && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] gap-1 text-destructive hover:text-destructive"
                onClick={() => onDelete(comment.id)}
              >
                <Trash2 className="h-2.5 w-2.5" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {replyingTo === comment.id && (
        <ReplyInput
          workflowId={comment.workflow_id}
          parentId={comment.id}
          onSubmit={() => onReply('')}
        />
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-6 pl-3 border-l border-border/50">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              onReply={onReply}
              onDelete={onDelete}
              replyingTo={replyingTo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CommentThread ──────────────────────────────────────

export function CommentThread({ workflowId, nodeId }: CommentThreadProps) {
  const [comments, setComments] = useState<WorkflowCommentWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      // Supabase not configured
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id);
    });
  }, []);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWorkflowComments(workflowId);
      const filtered = nodeId ? data.filter((c) => c.node_id === nodeId) : data;
      setComments(filtered);
    } catch {
      toast.error('Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [workflowId, nodeId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      // Supabase not configured, realtime updates unavailable
      return;
    }
    const channel = supabase
      .channel(`workflow:${workflowId}:comments`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workflow_comments',
          filter: `workflow_id=eq.${workflowId}`,
        },
        () => { fetchComments(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workflowId, fetchComments]);

  const handleAddComment = useCallback(async () => {
    const trimmed = newComment.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const result = await addWorkflowComment(workflowId, trimmed, nodeId);
      if (result.success) {
        setNewComment('');
      } else {
        toast.error('Failed to post comment', { description: result.error });
      }
    } catch {
      toast.error('Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  }, [newComment, submitting, workflowId, nodeId]);

  const handleDelete = useCallback(async (commentId: string) => {
    try {
      const result = await deleteWorkflowComment(commentId);
      if (!result.success) {
        toast.error('Failed to delete comment', { description: result.error });
      }
    } catch {
      toast.error('Failed to delete comment');
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  return (
    <Card className="h-full border-0 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Comments
          {nodeId && (
            <span className="text-xs text-muted-foreground font-normal">· Node</span>
          )}
          {comments.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal ml-auto">
              {comments.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 flex flex-col h-[calc(100%-4rem)]">
        <ScrollArea className="flex-1 max-h-96" ref={scrollRef}>
          {loading ? (
            <div className="space-y-3 p-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-2.5">
                  <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No comments yet</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                Start the conversation below.
              </p>
            </div>
          ) : (
            <div className="px-1">
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUserId}
                  onReply={setReplyingTo}
                  onDelete={handleDelete}
                  replyingTo={replyingTo}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center gap-1.5 pt-3 border-t mt-2">
          <Input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={nodeId ? 'Comment on this node...' : 'Add a comment...'}
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAddComment();
              }
            }}
            disabled={submitting}
          />
          <Button
            variant="default"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleAddComment}
            disabled={submitting || !newComment.trim()}
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
