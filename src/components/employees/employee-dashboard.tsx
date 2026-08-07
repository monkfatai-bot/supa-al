"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Activity, TrendingUp, DollarSign } from "lucide-react";
export function EmployeeDashboard() {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">Employee Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Employees", value: "—", icon: Bot },
          { label: "Active Now", value: "—", icon: Activity },
          { label: "Tasks Completed", value: "—", icon: TrendingUp },
          { label: "Credits Used", value: "—", icon: DollarSign },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{s.value}</div></CardContent>
          </Card>
        ))}
      </div>
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        Employee performance metrics and activity will appear here once employees are hired and start working.
      </div>
    </div>
  );
}
