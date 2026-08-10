"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3, TrendingUp,
  Clock, Zap, Star, CheckCircle2, XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getEmployeePerformance, getEmployee, getEmployees } from "@/services/employee";
import type { EmployeePerformance, EmployeeWithSkills } from "@/services/employee";

// ── Props ─────────────────────────────────────────────────────────────

interface EmployeePerformanceDashboardProps {
  workspaceId: string;
  employeeId?: string;
}

// ── Component ──────────────────────────────────────────────────────────

export function EmployeePerformanceDashboard({ workspaceId, employeeId }: EmployeePerformanceDashboardProps) {
  const [performance, setPerformance] = useState<EmployeePerformance[]>([]);
  const [employee, setEmployee] = useState<EmployeeWithSkills | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch employees for selection if no employeeId provided
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(employeeId ?? null);

  const fetchData = useCallback(async () => {
    const eid = selectedEmployeeId ?? employeeId;
    if (!eid) return;
    setLoading(true);
    try {
      const [perfRes, empRes] = await Promise.all([
        getEmployeePerformance(eid),
        getEmployee(eid),
      ]);
      if (perfRes.performance) setPerformance(perfRes.performance);
      if (empRes.employee) setEmployee(empRes.employee);
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

  if (loading || (!selectedEmployeeId && !employeeId)) {
    if (!selectedEmployeeId && !employeeId && employees.length > 0) {
      return (
        <div className="space-y-6">
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
        </div>
      );
    }
    if (loading) {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-60" />
        </div>
      );
    }
  }

  const emp = employee?.employee;
  const totalTasks = performance.reduce((s, p) => s + (p.tasks_completed ?? 0), 0);
  const totalFailed = performance.reduce((s, p) => s + (p.tasks_failed ?? 0), 0);
  const totalCredits = performance.reduce((s, p) => s + (p.ai_credits_used ?? 0), 0);
  const avgResponse = performance.length > 0
    ? Math.round(performance.reduce((s, p) => s + (p.avg_response_time_ms ?? 0), 0) / performance.length)
    : 0;
  const avgRating = performance.length > 0
    ? performance.reduce((s, p) => s + (p.user_rating ?? 0), 0) / performance.length
    : emp?.performance_rating ?? 0;
  const successRate = totalTasks + totalFailed > 0
    ? Math.round((totalTasks / (totalTasks + totalFailed)) * 100)
    : 0;

  return (
    <div className="space-y-6">
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
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Tasks Completed"
          value={totalTasks}
          icon={<CheckCircle2 className="size-5 text-emerald-600" />}
          trend={null}
        />
        <MetricCard
          label="Tasks Failed"
          value={totalFailed}
          icon={<XCircle className="size-5 text-red-500" />}
          trend={null}
        />
        <MetricCard
          label="Success Rate"
          value={`${successRate}%`}
          icon={<TrendingUp className="size-5 text-blue-600" />}
          trend={successRate >= 80 ? "good" : successRate >= 50 ? "moderate" : "poor"}
        />
        <MetricCard
          label="Avg Rating"
          value={avgRating.toFixed(1)}
          icon={<Star className="size-5 text-amber-500" />}
          trend={avgRating >= 4 ? "good" : avgRating >= 2.5 ? "moderate" : "poor"}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="size-4 text-amber-500" />
              <span className="text-sm font-medium">AI Credits Used</span>
            </div>
            <p className="text-2xl font-bold">{totalCredits.toLocaleString()}</p>
            {emp && (
              <p className="text-xs text-muted-foreground mt-1">
                Lifetime: {emp.total_ai_credits_used.toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="size-4 text-blue-500" />
              <span className="text-sm font-medium">Avg Response Time</span>
            </div>
            <p className="text-2xl font-bold">{avgResponse > 0 ? `${avgResponse}ms` : "N/A"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Performance History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Performance History</CardTitle>
        </CardHeader>
        <CardContent>
          {performance.length === 0 ? (
            <div className="text-center py-8">
              <BarChart3 className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No performance data recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {performance.map((p) => {
                const completed = p.tasks_completed ?? 0;
                const failed = p.tasks_failed ?? 0;
                const total = completed + failed;
                const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

                return (
                  <div key={p.id} className="p-3 rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">
                        {new Date(p.period_start).toLocaleDateString()} — {new Date(p.period_end).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-1">
                        <Star className="size-3.5 text-amber-500 fill-amber-500" />
                        <span className="text-sm font-medium">{p.user_rating?.toFixed(1) ?? "N/A"}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Completed:</span>
                        <span className="font-medium ml-1">{completed}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Failed:</span>
                        <span className="font-medium ml-1">{failed}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Credits:</span>
                        <span className="font-medium ml-1">{p.ai_credits_used}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Response:</span>
                        <span className="font-medium ml-1">{p.avg_response_time_ms > 0 ? `${p.avg_response_time_ms}ms` : "N/A"}</span>
                      </div>
                    </div>
                    {total > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        <Progress value={rate} className="h-1.5 flex-1" />
                        <span className="text-[10px] text-muted-foreground">{rate}%</span>
                      </div>
                    )}
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

// ── Sub-components ─────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend: "good" | "moderate" | "poor" | null;
}

function MetricCard({ label, value, icon, trend }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xl font-bold">{value}</p>
          {trend && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              trend === "good" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" :
              trend === "moderate" ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" :
              "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
            }`}>
              {trend === "good" ? "Good" : trend === "moderate" ? "Fair" : "Low"}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
