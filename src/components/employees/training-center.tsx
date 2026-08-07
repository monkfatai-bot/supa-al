"use client";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Link2, BookOpen } from "lucide-react";
export function TrainingCenter() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Training Center</h1>
        <Button size="sm"><Plus className="mr-1 size-4" /> New Training</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: FileText, label: "From Document", desc: "Train from uploaded documents" },
          { icon: Link2, label: "From URL", desc: "Train from a website URL" },
          { icon: BookOpen, label: "From Knowledge Base", desc: "Train from KB entries" },
        ].map((opt) => (
          <div key={opt.label} className="rounded-lg border p-4">
            <opt.icon className="mb-2 size-6 text-muted-foreground" />
            <div className="font-medium">{opt.label}</div>
            <div className="text-sm text-muted-foreground">{opt.desc}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        Training history and status will appear here.
      </div>
    </div>
  );
}
