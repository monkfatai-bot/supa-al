"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Users, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { EmployeeCard } from "./employee-card";
import { getEmployeeDirectory, getEmployeeDashboard } from "@/services/employee";
import type { EmployeeWithSkills, EmployeeDashboardStats } from "@/services/employee";

// ── Props ─────────────────────────────────────────────────────────────

interface EmployeeDirectoryProps {
  workspaceId: string;
}

// ── Component ──────────────────────────────────────────────────────────

export function EmployeeDirectory({ workspaceId }: EmployeeDirectoryProps) {
  const [employees, setEmployees] = useState<EmployeeWithSkills[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<EmployeeDashboardStats | null>(null);

  // Filters
  const [filterDept, setFilterDept] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("created");

  const pageSize = 12;

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getEmployeeDirectory(workspaceId, {
        page,
        pageSize,
        department: filterDept,
        status: filterStatus,
        search: searchQuery || undefined,
        sort: sortBy,
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        setEmployees(result.data);
        setTotal(result.total);
      }
    } catch {
      setError("Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, filterDept, filterStatus, searchQuery, sortBy]);

  const fetchStats = useCallback(async () => {
    try {
      const result = await getEmployeeDashboard(workspaceId);
      if (result.stats) setStats(result.stats);
    } catch {
      // Silent fail for stats
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total Employees" value={stats.totalEmployees} />
          <StatCard label="Active" value={stats.activeEmployees} />
          <StatCard label="Tasks Done" value={stats.totalTasksCompleted} />
          <StatCard label="Avg Rating" value={stats.avgRating.toFixed(1)} />
          <StatCard label="Top Dept" value={stats.topDepartment} />
          <StatCard label="Credits Used" value={stats.totalCreditsUsed} />
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">AI Employees</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your AI workforce
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/employees/manage">
            <Button>Manage Employees</Button>
          </Link>
          <Link href="/employees/marketplace">
            <Button variant="outline">Marketplace</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search employees..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={filterDept} onValueChange={(v) => { setFilterDept(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                <SelectItem value="Engineering">Engineering</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Sales">Sales</SelectItem>
                <SelectItem value="Support">Support</SelectItem>
                <SelectItem value="Design">Design</SelectItem>
                <SelectItem value="Operations">Operations</SelectItem>
                <SelectItem value="HR">HR</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created">Newest</SelectItem>
                <SelectItem value="name_asc">Name A-Z</SelectItem>
                <SelectItem value="name_desc">Name Z-A</SelectItem>
                <SelectItem value="rating">Top Rated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <AlertCircle className="size-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchEmployees} className="ml-auto">
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Employee Grid */}
      {!loading && !error && employees.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12">
            <Users className="size-12 text-muted-foreground" />
            <h3 className="font-semibold text-lg">No employees found</h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery ? "Try a different search term" : "Create your first AI employee to get started"}
            </p>
            {!searchQuery && (
              <Link href="/employees/manage">
                <Button>Create Employee</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && !error && employees.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((ew) => (
            <Link key={ew.employee.id} href={`/employees/${ew.employee.id}`}>
              <EmployeeCard employee={ew} />
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-3">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
