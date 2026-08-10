"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Globe, BookOpen, Plus, Loader2,
  FileText, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  trainEmployee,
  getEmployeeTraining,
  getEmployees,
} from "@/services/employee";
import type { EmployeeTraining, EmployeeTrainingType } from "@/services/employee";
import { useToast } from "@/hooks/use-toast";

// ── Props ─────────────────────────────────────────────────────────────

interface EmployeeTrainingCenterProps {
  workspaceId: string;
  employeeId?: string;
}

// ── Status Config ────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
  pending: { variant: "outline", icon: Clock },
  processing: { variant: "secondary", icon: Loader2 },
  completed: { variant: "default", icon: CheckCircle2 },
  failed: { variant: "destructive", icon: XCircle },
};

// ── Component ──────────────────────────────────────────────────────────

export function EmployeeTrainingCenter({ workspaceId, employeeId }: EmployeeTrainingCenterProps) {
  const { toast } = useToast();
  const [trainingHistory, setTrainingHistory] = useState<EmployeeTraining[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Fetch employees for selection if no employeeId provided
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(employeeId ?? null);

  // Form
  const [trainType, setTrainType] = useState<EmployeeTrainingType>("document");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const fetchHistory = useCallback(async () => {
    const eid = selectedEmployeeId ?? employeeId;
    if (!eid) return;
    setLoading(true);
    try {
      const result = await getEmployeeTraining(eid);
      if (result.training) setTrainingHistory(result.training);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [selectedEmployeeId, employeeId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (!employeeId) {
      getEmployees(workspaceId, { pageSize: 100 }).then(res => {
        if ('data' in res) {
          setEmployees(res.data.map(e => ({ id: e.id, name: e.name, role: e.role ?? 'employee' })));
        }
      }).catch(() => {});
    }
  }, [workspaceId, employeeId]);

  const handleTrain = async () => {
    if (!sourceName.trim()) return;
    setSubmitting(true);
    try {
      const result = await trainEmployee(
        selectedEmployeeId ?? employeeId!,
        trainType,
        { source_name: sourceName, source_url: sourceUrl || undefined, training_type: trainType },
        workspaceId
      );
      if (result.success) {
        toast({ title: "Training Started", description: result.message });
        setSourceName("");
        setSourceUrl("");
        fetchHistory();
      } else {
        toast({ title: "Error", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to start training", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Employee Selector */}
      {!selectedEmployeeId && !employeeId && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Select Employee</CardTitle></CardHeader>
          <CardContent>
            <Select onValueChange={(v) => setSelectedEmployeeId(v)}>
              <SelectTrigger><SelectValue placeholder="Choose an employee..." /></SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.name} — {e.role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {(selectedEmployeeId || employeeId) && <>
      {/* Training Input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Start New Training</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>Training Type</Label>
              <Select value={trainType} onValueChange={(v) => setTrainType(v as EmployeeTrainingType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="document">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4" /> Document
                    </div>
                  </SelectItem>
                  <SelectItem value="website">
                    <div className="flex items-center gap-2">
                      <Globe className="size-4" /> Website
                    </div>
                  </SelectItem>
                  <SelectItem value="conversation">
                    <div className="flex items-center gap-2">
                      <BookOpen className="size-4" /> Conversation
                    </div>
                  </SelectItem>
                  <SelectItem value="knowledge_base">
                    <div className="flex items-center gap-2">
                      <BookOpen className="size-4" /> Knowledge Base
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Source Name *</Label>
              <Input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder={
                  trainType === "document" ? "e.g., Company Handbook.pdf" :
                  trainType === "website" ? "e.g., docs.example.com" :
                  trainType === "conversation" ? "e.g., Customer Support Script" :
                  "e.g., Product FAQ"
                }
              />
            </div>

            {trainType === "website" && (
              <div>
                <Label>URL</Label>
                <Input
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://example.com/docs"
                  type="url"
                />
              </div>
            )}

            <Button
              onClick={handleTrain}
              disabled={submitting || !sourceName.trim()}
            >
              {submitting ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
              {submitting ? "Starting..." : "Start Training"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Training History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Training History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : trainingHistory.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No training records yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Start training to build this employee&apos;s knowledge.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {trainingHistory.map((t) => {
                const cfg = STATUS_BADGE[t.status] ?? STATUS_BADGE.pending;
                const Icon = cfg.icon;
                return (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={`size-4 ${t.status === "processing" ? "animate-spin" : ""}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.source_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                            {t.training_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {t.processed_items} / {t.items_count} items
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(t.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Badge variant={cfg.variant} className="capitalize shrink-0">
                      {t.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </>}
    </div>
  );
}
