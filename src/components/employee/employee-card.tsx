"use client";

import { Bot, Star, MapPin, BadgeCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { EmployeeWithSkills } from "@/services/employee";

// ── Props ─────────────────────────────────────────────────────────────

interface EmployeeCardProps {
  employee: EmployeeWithSkills;
}

// ── Status Config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  active: { variant: "default", label: "Active" },
  inactive: { variant: "secondary", label: "Inactive" },
  archived: { variant: "outline", label: "Archived" },
};

const AVAILABILITY_CONFIG: Record<string, { color: string; label: string }> = {
  available: { color: "bg-emerald-500", label: "Available" },
  busy: { color: "bg-amber-500", label: "Busy" },
  offline: { color: "bg-zinc-400", label: "Offline" },
};

// ── Component ──────────────────────────────────────────────────────────

export function EmployeeCard({ employee }: EmployeeCardProps) {
  const { employee: emp, skills } = employee;
  const status = STATUS_CONFIG[emp.status] ?? STATUS_CONFIG.active;
  const availability = AVAILABILITY_CONFIG[emp.availability_status] ?? AVAILABILITY_CONFIG.available;

  const topSkills = skills.slice(0, 3);

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
      <CardContent className="p-5">
        {/* Header: Avatar + Name + Status */}
        <div className="flex items-start gap-4">
          <div className="relative">
            <Avatar className="h-12 w-12">
              {emp.avatar_url ? (
                <AvatarFallback className="bg-primary/10 text-primary">
                  {emp.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              ) : (
                <AvatarFallback className="bg-primary/10 text-primary">
                  <Bot className="size-5" />
                </AvatarFallback>
              )}
            </Avatar>
            <div className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-background ${availability.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{emp.name}</h3>
            <p className="text-xs text-muted-foreground truncate">{emp.role}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={status.variant} className="text-[10px] px-1.5 py-0">
                {status.label}
              </Badge>
              <span className="text-[10px] text-muted-foreground">{availability.label}</span>
            </div>
          </div>
        </div>

        {/* Department */}
        {emp.department && (
          <div className="flex items-center gap-1.5 mt-3">
            <MapPin className="size-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{emp.department}</span>
          </div>
        )}

        {/* Skills */}
        {topSkills.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {topSkills.map((s) => (
              <Badge key={s.id} variant="secondary" className="text-[10px] px-1.5 py-0">
                {s.skill_name}
              </Badge>
            ))}
            {skills.length > 3 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                +{skills.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Rating + Tasks */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex items-center gap-1">
            <Star className="size-3.5 text-amber-500 fill-amber-500" />
            <span className="text-xs font-medium">
              {emp.performance_rating ? emp.performance_rating.toFixed(1) : "N/A"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <BadgeCheck className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {emp.total_tasks_completed} tasks
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
            {emp.experience_level}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
