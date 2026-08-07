"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useEmployeeStore, type EmployeeTab } from "@/stores/employee-store";
import { LayoutDashboard, Store, GraduationCap, Users } from "lucide-react";
import { EmployeeDirectory } from "./employee-directory";
import { EmployeeDashboard } from "./employee-dashboard";
import { MarketplaceView } from "./marketplace-view";
import { TrainingCenter } from "./training-center";

const TABS: { id: EmployeeTab; label: string; icon: typeof Users }[] = [
  { id: "directory", label: "Directory", icon: Users },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "marketplace", label: "Marketplace", icon: Store },
  { id: "training", label: "Training", icon: GraduationCap },
];

export function EmployeesView() {
  const activeTab = useEmployeeStore((s) => s.activeTab);
  const setActiveTab = useEmployeeStore((s) => s.setActiveTab);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-2 scrollbar-thin">
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn("inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <tab.icon className="size-4" /> {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === "directory" && <EmployeeDirectory />}
        {activeTab === "dashboard" && <EmployeeDashboard />}
        {activeTab === "marketplace" && <MarketplaceView />}
        {activeTab === "training" && <TrainingCenter />}
      </div>
    </div>
  );
}
