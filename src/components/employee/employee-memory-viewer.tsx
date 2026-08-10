"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Brain, Search, Trash2, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getEmployeeMemory,
  addEmployeeMemory,
  clearEmployeeMemory,
  getEmployees,
} from "@/services/employee";
import type { EmployeeMemory, EmployeeMemoryScope } from "@/services/employee";
import { useToast } from "@/hooks/use-toast";

// ── Props ─────────────────────────────────────────────────────────────

interface EmployeeMemoryViewerProps {
  workspaceId: string;
  employeeId?: string;
}

// ── Scope Config ─────────────────────────────────────────────────────

const SCOPE_COLORS: Record<string, string> = {
  long_term: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  session: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  workspace: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  task: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

// ── Component ──────────────────────────────────────────────────────────

export function EmployeeMemoryViewer({ workspaceId, employeeId }: EmployeeMemoryViewerProps) {
  const { toast } = useToast();
  const [memory, setMemory] = useState<EmployeeMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterScope, setFilterScope] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch employees for selection if no employeeId provided
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(employeeId ?? null);

  // Add memory
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [newScope, setNewScope] = useState<EmployeeMemoryScope>("long_term");

  const fetchMemory = useCallback(async () => {
    const eid = selectedEmployeeId ?? employeeId;
    if (!eid) return;
    setLoading(true);
    try {
      const scope = filterScope !== "all" ? (filterScope as EmployeeMemoryScope) : undefined;
      const result = await getEmployeeMemory(eid, scope);
      if (result.memory) setMemory(result.memory);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [selectedEmployeeId, employeeId, filterScope]);

  useEffect(() => {
    fetchMemory();
  }, [fetchMemory]);

  useEffect(() => {
    if (!employeeId) {
      getEmployees(workspaceId, { pageSize: 100 }).then(res => {
        if ('data' in res) {
          setEmployees(res.data.map(e => ({ id: e.id, name: e.name, role: e.role ?? 'employee' })));
        }
      }).catch(() => {});
    }
  }, [workspaceId, employeeId]);

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    setAdding(true);
    try {
      const result = await addEmployeeMemory(selectedEmployeeId ?? employeeId!, {
        scope: newScope,
        category: newCategory,
        content: newContent,
      });
      if (result.success) {
        toast({ title: "Success", description: result.message });
        setNewContent("");
        fetchMemory();
      } else {
        toast({ title: "Error", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to add memory", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleClear = async () => {
    const scope = filterScope !== "all" ? (filterScope as EmployeeMemoryScope) : undefined;
    const result = await clearEmployeeMemory(selectedEmployeeId ?? employeeId!, scope);
    if (result.success) {
      toast({ title: "Cleared", description: result.message });
      fetchMemory();
    } else {
      toast({ title: "Error", description: result.message, variant: "destructive" });
    }
  };

  const filtered = memory.filter((m) =>
    !searchQuery || m.content.toLowerCase().includes(searchQuery.toLowerCase()) || m.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

      {(selectedEmployeeId || employeeId) && (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="size-5" /> Memory
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="size-3.5 mr-1.5" /> Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search memory..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterScope} onValueChange={setFilterScope}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scopes</SelectItem>
              <SelectItem value="long_term">Long-term</SelectItem>
              <SelectItem value="session">Session</SelectItem>
              <SelectItem value="workspace">Workspace</SelectItem>
              <SelectItem value="task">Task</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Add Memory */}
        <div className="p-3 border rounded-lg space-y-3">
          <p className="text-sm font-medium">Add Memory Entry</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Enter memory content..."
              className="flex-1"
            />
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Category"
              className="w-[120px]"
            />
            <Select value={newScope} onValueChange={(v) => setNewScope(v as EmployeeMemoryScope)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="long_term">Long-term</SelectItem>
                <SelectItem value="session">Session</SelectItem>
                <SelectItem value="workspace">Workspace</SelectItem>
                <SelectItem value="task">Task</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAdd} disabled={adding || !newContent.trim()} size="sm">
              {adding ? <Loader2 className="size-4 animate-spin" /> : "Add"}
            </Button>
          </div>
        </div>

        {/* Memory List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <Brain className="size-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No memory entries found.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filtered.map((m) => (
              <div key={m.id} className="p-3 rounded-lg border">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${SCOPE_COLORS[m.scope] ?? ""}`}>
                      {m.scope}
                    </span>
                    <span className="text-xs text-muted-foreground">{m.category}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm">{m.content}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
      )}
    </div>
  );
}
