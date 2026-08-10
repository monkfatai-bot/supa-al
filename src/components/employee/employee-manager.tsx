"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Search, Loader2, MoreHorizontal,
  Pencil, Trash2, Copy, Archive, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createEmployee,
  updateEmployee,
  deleteEmployee,
  archiveEmployee,
  cloneEmployee,
  getEmployees,
} from "@/services/employee";
import type { AiEmployee, EmployeeExperienceLevel } from "@/services/employee";
import { useToast } from "@/hooks/use-toast";

// ── Props ─────────────────────────────────────────────────────────────

interface EmployeeManagerProps {
  workspaceId: string;
}

// ── Component ──────────────────────────────────────────────────────────

export function EmployeeManager({ workspaceId }: EmployeeManagerProps) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<AiEmployee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formDept, setFormDept] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formBio, setFormBio] = useState("");
  const [formExp, setFormExp] = useState<EmployeeExperienceLevel>("mid");
  const [formTags, setFormTags] = useState("");

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<string>("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editBio, setEditBio] = useState("");

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getEmployees(workspaceId, {
        page,
        pageSize,
        search: searchQuery || undefined,
      });
      if ("error" in result) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      } else {
        setEmployees(result.data);
        setTotal(result.total);
      }
    } catch {
      toast({ title: "Error", description: "Failed to fetch employees", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, searchQuery, toast]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Handlers
  const handleCreate = async () => {
    if (!formName.trim()) return;
    setCreating(true);
    try {
      const result = await createEmployee({
        name: formName,
        role: formRole,
        department: formDept,
        description: formDesc,
        bio: formBio,
        experience_level: formExp,
        tags: formTags ? formTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      }, workspaceId);
      if (result.success) {
        toast({ title: "Success", description: result.message });
        setCreateOpen(false);
        setFormName("");
        setFormRole("");
        setFormDept("");
        setFormDesc("");
        setFormBio("");
        setFormTags("");
        fetchEmployees();
      } else {
        toast({ title: "Error", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to create employee", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!editName.trim()) return;
    setEditing(true);
    try {
      const result = await updateEmployee(editId, {
        name: editName,
        role: editRole,
        department: editDept,
        description: editDesc,
        bio: editBio,
      }, workspaceId);
      if (result.success) {
        toast({ title: "Success", description: result.message });
        setEditOpen(false);
        fetchEmployees();
      } else {
        toast({ title: "Error", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update employee", variant: "destructive" });
    } finally {
      setEditing(false);
    }
  };

  const handleDelete = async (id: string) => {
    const result = await deleteEmployee(id, workspaceId);
    if (result.success) {
      toast({ title: "Success", description: result.message });
      fetchEmployees();
    } else {
      toast({ title: "Error", description: result.message, variant: "destructive" });
    }
  };

  const handleArchive = async (id: string) => {
    const result = await archiveEmployee(id, workspaceId);
    if (result.success) {
      toast({ title: "Success", description: result.message });
      fetchEmployees();
    } else {
      toast({ title: "Error", description: result.message, variant: "destructive" });
    }
  };

  const handleClone = async (id: string) => {
    const result = await cloneEmployee(id, workspaceId);
    if (result.success) {
      toast({ title: "Success", description: result.message });
      fetchEmployees();
    } else {
      toast({ title: "Error", description: result.message, variant: "destructive" });
    }
  };

  const openEditDialog = (emp: AiEmployee) => {
    setEditId(emp.id);
    setEditName(emp.name);
    setEditRole(emp.role);
    setEditDept(emp.department);
    setEditDesc(emp.description ?? "");
    setEditBio(emp.bio ?? "");
    setEditOpen(true);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Manage Employees</h2>
          <p className="text-muted-foreground text-sm mt-1">Create, edit, and manage your AI workforce</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-2" /> Create Employee
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create AI Employee</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Name *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Alex - Marketing Assistant" />
              </div>
              <div>
                <Label>Role</Label>
                <Input value={formRole} onChange={(e) => setFormRole(e.target.value)} placeholder="e.g., Marketing Assistant" />
              </div>
              <div>
                <Label>Department</Label>
                <Input value={formDept} onChange={(e) => setFormDept(e.target.value)} placeholder="e.g., Marketing" />
              </div>
              <div>
                <Label>Experience Level</Label>
                <Select value={formExp} onValueChange={(v) => setFormExp(v as EmployeeExperienceLevel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="junior">Junior</SelectItem>
                    <SelectItem value="mid">Mid-Level</SelectItem>
                    <SelectItem value="senior">Senior</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="What does this employee do?" rows={2} />
              </div>
              <div>
                <Label>Bio</Label>
                <Textarea value={formBio} onChange={(e) => setFormBio(e.target.value)} placeholder="Brief bio for the employee" rows={2} />
              </div>
              <div>
                <Label>Tags (comma-separated)</Label>
                <Input value={formTags} onChange={(e) => setFormTags(e.target.value)} placeholder="e.g., marketing, email, social" />
              </div>
              <Button onClick={handleCreate} disabled={creating || !formName.trim()} className="w-full">
                {creating ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                {creating ? "Creating..." : "Create Employee"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : employees.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12">
              <Bot className="size-12 text-muted-foreground" />
              <h3 className="font-semibold text-lg">No employees found</h3>
              <p className="text-muted-foreground text-sm">Create your first AI employee to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Experience</TableHead>
                  <TableHead>Tasks</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            <Bot className="size-3.5" />
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{emp.name}</p>
                          <p className="text-xs text-muted-foreground">ID: {emp.id.slice(0, 8)}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{emp.role}</TableCell>
                    <TableCell className="text-sm">{emp.department}</TableCell>
                    <TableCell>
                      <Badge variant={emp.status === "active" ? "default" : emp.status === "inactive" ? "secondary" : "outline"}>
                        {emp.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm capitalize">{emp.experience_level}</TableCell>
                    <TableCell className="text-sm">{emp.total_tasks_completed}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(emp)}>
                            <Pencil className="size-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleClone(emp.id)}>
                            <Copy className="size-4 mr-2" /> Clone
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleArchive(emp.id)}>
                            <Archive className="size-4 mr-2" /> Archive
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => handleDelete(emp.id)}>
                            <Trash2 className="size-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            &lt;
          </Button>
          <span className="text-sm text-muted-foreground px-3">Page {page} of {totalPages}</span>
          <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            &gt;
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit AI Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Name *</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>Role</Label>
              <Input value={editRole} onChange={(e) => setEditRole(e.target.value)} />
            </div>
            <div>
              <Label>Department</Label>
              <Input value={editDept} onChange={(e) => setEditDept(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} />
            </div>
            <div>
              <Label>Bio</Label>
              <Textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={2} />
            </div>
            <Button onClick={handleUpdate} disabled={editing || !editName.trim()} className="w-full">
              {editing ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              {editing ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
