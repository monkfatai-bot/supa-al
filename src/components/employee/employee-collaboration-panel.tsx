"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users, Link as LinkIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getEmployeeProfile, getEmployees } from "@/services/employee";
import type { EmployeeAssignment } from "@/services/employee";

// ── Props ─────────────────────────────────────────────────────────────

interface EmployeeCollaborationPanelProps {
  workspaceId: string;
  employeeId?: string;
}

// ── Component ──────────────────────────────────────────────────────────

export function EmployeeCollaborationPanel({ workspaceId, employeeId }: EmployeeCollaborationPanelProps) {
  const [assignments, setAssignments] = useState<EmployeeAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch employees for selection if no employeeId provided
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(employeeId ?? null);

  const fetchData = useCallback(async () => {
    const eid = selectedEmployeeId ?? employeeId;
    if (!eid) return;
    setLoading(true);
    try {
      const result = await getEmployeeProfile(eid);
      if (result.profile) {
        setAssignments(result.profile.assignments.filter((a) => a.status === "active"));
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [selectedEmployeeId, employeeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!employeeId) {
      getEmployees(workspaceId, { pageSize: 100 }).then(res => {
        if ('data' in res) {
          setEmployees(res.data.map(e => ({ id: e.id, name: e.name, role: e.role ?? 'employee' })));
        }
      }).catch(() => {});
    }
  }, [workspaceId, employeeId]);

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
      {/* Active Assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <LinkIcon className="size-5" /> Active Assignments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-8">
              <Users className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No active assignments.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Assign this employee to projects or tasks to see them here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {a.assignment_type}
                      </Badge>
                      <span className="text-sm font-medium">
                        {a.assignment_type === "project" && a.project_id
                          ? `Project ${a.project_id.slice(0, 8)}`
                          : a.assignment_type === "task" && a.task_id
                          ? `Task ${a.task_id.slice(0, 8)}`
                          : `${a.assignment_type} assignment`}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Started {new Date(a.started_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="default">{a.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Collaboration Note */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Users className="size-4" />
            <p>Inter-employee collaboration features coming soon. Employees can be assigned to the same project to coordinate work.</p>
          </div>
        </CardContent>
      </Card>
      </>}
    </div>
  );
}
