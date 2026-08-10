"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bot, Star, MapPin, Clock, Tag, Brain, GraduationCap,
  BarChart3, ChevronLeft, BadgeCheck, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getEmployeeProfile } from "@/services/employee";
import type { EmployeeFullProfile } from "@/services/employee";
import { EmployeeTrainingCenter } from "./employee-training-center";
import { EmployeeMemoryViewer } from "./employee-memory-viewer";
import { EmployeePerformanceDashboard } from "./employee-performance-dashboard";

// ── Props ─────────────────────────────────────────────────────────────

interface EmployeeProfileProps {
  employeeId: string;
  workspaceId: string;
}

// ── Component ──────────────────────────────────────────────────────────

export function EmployeeProfile({ employeeId, workspaceId }: EmployeeProfileProps) {
  const [profile, setProfile] = useState<EmployeeFullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getEmployeeProfile(employeeId);
      if (result.profile) {
        setProfile(result.profile);
      } else {
        setError(result.error ?? "Failed to load profile");
      }
    } catch {
      setError("Failed to load employee profile");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6">
          <AlertCircle className="size-5 text-destructive" />
          <p className="text-sm text-destructive">{error || "Employee not found"}</p>
          <Link href="/employees">
            <Button variant="outline" size="sm" className="ml-auto">
              <ChevronLeft className="size-4 mr-1" /> Back
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const { employee, skills, assignments, performance } = profile;
  const avgRating = performance.length > 0
    ? performance.reduce((sum, p) => sum + (p.user_rating ?? 0), 0) / performance.length
    : employee.performance_rating ?? 0;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/employees">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="size-4 mr-1" /> Back to Directory
        </Button>
      </Link>

      {/* Overview Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-2">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="bg-primary/10 text-primary text-xl">
                  <Bot className="size-8" />
                </AvatarFallback>
              </Avatar>
              <Badge variant="outline" className="capitalize">{employee.status}</Badge>
            </div>

            {/* Info Section */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold">{employee.name}</h1>
              <p className="text-muted-foreground mt-1">{employee.role}</p>

              <div className="flex flex-wrap items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-muted-foreground" />
                  <span className="text-sm">{employee.department || "No Department"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Star className="size-4 text-amber-500 fill-amber-500" />
                  <span className="text-sm font-medium">{avgRating.toFixed(1)} / 5.0</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-muted-foreground" />
                  <span className="text-sm">{employee.total_tasks_completed} tasks completed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="size-4 text-muted-foreground" />
                  <span className="text-sm capitalize">{employee.experience_level}</span>
                </div>
              </div>

              {/* Bio */}
              {employee.bio && (
                <p className="text-sm text-muted-foreground mt-3 max-w-2xl">{employee.bio}</p>
              )}

              {/* Tags */}
              {employee.tags && employee.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {employee.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      <Tag className="size-3 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3 min-w-[180px]">
              <QuickStat label="Credits Used" value={employee.total_ai_credits_used} />
              <QuickStat label="Skills" value={skills.length} />
              <QuickStat label="Assignments" value={assignments.filter((a) => a.status === "active").length} />
              <QuickStat label="Availability" value={employee.availability_status} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="skills" className="space-y-4">
        <TabsList>
          <TabsTrigger value="skills">
            <Brain className="size-4 mr-1.5" /> Skills
          </TabsTrigger>
          <TabsTrigger value="memory">
            <Brain className="size-4 mr-1.5" /> Memory
          </TabsTrigger>
          <TabsTrigger value="training">
            <GraduationCap className="size-4 mr-1.5" /> Training
          </TabsTrigger>
          <TabsTrigger value="performance">
            <BarChart3 className="size-4 mr-1.5" /> Performance
          </TabsTrigger>
          <TabsTrigger value="assignments">
            Assignments
          </TabsTrigger>
        </TabsList>

        {/* Skills Tab */}
        <TabsContent value="skills">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Skills & Expertise</CardTitle>
            </CardHeader>
            <CardContent>
              {skills.length === 0 ? (
                <p className="text-sm text-muted-foreground">No skills added yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {skills.map((skill) => (
                    <div key={skill.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="text-sm font-medium">{skill.skill_name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{skill.skill_category}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={skill.proficiency_level} className="w-20 h-2" />
                        <span className="text-xs font-medium w-8 text-right">{skill.proficiency_level}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Memory Tab */}
        <TabsContent value="memory">
          <EmployeeMemoryViewer workspaceId={workspaceId} employeeId={employeeId} />
        </TabsContent>

        {/* Training Tab */}
        <TabsContent value="training">
          <EmployeeTrainingCenter employeeId={employeeId} workspaceId={workspaceId} />
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          <EmployeePerformanceDashboard workspaceId={workspaceId} employeeId={employeeId} />
        </TabsContent>

        {/* Assignments Tab */}
        <TabsContent value="assignments">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Active Assignments</CardTitle>
            </CardHeader>
            <CardContent>
              {assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assignments yet.</p>
              ) : (
                <div className="space-y-3">
                  {assignments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="text-sm font-medium capitalize">{a.assignment_type} Assignment</p>
                        <p className="text-xs text-muted-foreground">
                          Since {new Date(a.started_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge
                        variant={a.status === "active" ? "default" : a.status === "completed" ? "secondary" : "destructive"}
                      >
                        {a.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function QuickStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center p-2 rounded-lg bg-muted/50">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}
