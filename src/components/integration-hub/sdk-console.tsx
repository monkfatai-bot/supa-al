"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Code2,
  Plus,
  Download,
  Eye,
  Loader2,
  Info,
  CheckCircle2,
  XCircle,
  Package,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  listSdkPackages,
  getSdkPackage,
  createSdkPackage,
  downloadSdkPackage,
} from "@/services/sdk/actions";
import type {
  SdkActionResponse,
  ManifestValidationResult,
} from "@/services/sdk/types";
import { validateManifest } from "@/services/sdk/types";
import type { SdkPackage } from "@/types/generated/database";

// ── Helpers ──────────────────────────────────────────────────────

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-[10px] px-1.5">
          Active
        </Badge>
      );
    case "deprecated":
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0 text-[10px] px-1.5">
          Deprecated
        </Badge>
      );
    case "archived":
      return <Badge variant="secondary" className="text-[10px] px-1.5">Archived</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px] px-1.5">{status}</Badge>;
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const DEFAULT_MANIFEST = JSON.stringify(
  {
    name: "",
    version: "1.0.0",
    type: "extension",
    permissions: [],
    entryPoint: "./index.ts",
  },
  null,
  2
);

// ── Props ────────────────────────────────────────────────────────

interface SdkConsoleProps {
  workspaceId: string;
  isAdmin?: boolean;
}

// ── Component ────────────────────────────────────────────────────

// workspaceId reserved for future workspace-scoped SDK package filtering
export function SdkConsole({ workspaceId: _workspaceId, isAdmin = false }: SdkConsoleProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<SdkPackage[]>([]);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createVersion, setCreateVersion] = useState("1.0.0");
  const [createAuthor, setCreateAuthor] = useState("");
  const [createManifest, setCreateManifest] = useState(DEFAULT_MANIFEST);
  const [manifestErrors, setManifestErrors] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // View dialog state
  const [viewPkg, setViewPkg] = useState<SdkPackage | null>(null);
  const [loadingView, setLoadingView] = useState(false);

  // Downloading state
  const [downloadingSlug, setDownloadingSlug] = useState<string | null>(null);

  const fetchPackages = useCallback(() => {
    setLoading(true);
    setError(null);

    listSdkPackages()
      .then((res: SdkActionResponse) => {
        if (res.success && Array.isArray(res.data)) {
          setPackages(res.data as SdkPackage[]);
        } else {
          setError(res.message ?? "Failed to load SDK packages");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // ── Auto-generate slug ─────────────────────────────────────────

  useEffect(() => {
    setCreateSlug(slugify(createName || "my-package"));
  }, [createName]);

  // ── Manifest validation (live) ─────────────────────────────────

  const validateLiveManifest = (json: string): string[] => {
    try {
      const parsed = JSON.parse(json);
      const result: ManifestValidationResult = validateManifest(parsed);
      return result.errors;
    } catch {
      return ["Invalid JSON syntax"];
    }
  };

  useEffect(() => {
    if (createManifest.trim()) {
      setManifestErrors(validateLiveManifest(createManifest));
    }
  }, [createManifest]);

  // ── Create handler ─────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createName.trim()) {
      toast.error("Package name is required");
      return;
    }
    if (!createVersion.trim()) {
      toast.error("Version is required");
      return;
    }
    const errors = validateLiveManifest(createManifest);
    if (errors.length > 0) {
      toast.error("Fix manifest errors before creating");
      return;
    }

    setCreating(true);
    try {
      const manifestParsed = JSON.parse(createManifest);
      const res = await createSdkPackage({
        name: createName.trim(),
        description: createDesc.trim() || undefined,
        version: createVersion.trim(),
        author: createAuthor.trim() || undefined,
        manifest: manifestParsed,
      });
      if (res.success) {
        toast.success("Package created successfully");
        setCreateOpen(false);
        resetCreateForm();
        fetchPackages();
      } else {
        toast.error(res.message ?? "Failed to create package");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setCreateName("");
    setCreateSlug("");
    setCreateDesc("");
    setCreateVersion("1.0.0");
    setCreateAuthor("");
    setCreateManifest(DEFAULT_MANIFEST);
    setManifestErrors([]);
  };

  // ── View handler ───────────────────────────────────────────────

  const openView = async (pkg: SdkPackage) => {
    setViewPkg(pkg);
    setLoadingView(true);
    try {
      const res = await getSdkPackage(pkg.slug);
      if (res.success && res.data) {
        setViewPkg(res.data as SdkPackage);
      }
    } catch {
      // fall back to the existing data
    } finally {
      setLoadingView(false);
    }
  };

  // ── Download handler ───────────────────────────────────────────

  const handleDownload = async (slug: string) => {
    setDownloadingSlug(slug);
    try {
      const res = await downloadSdkPackage(slug);
      if (res.success) {
        toast.success("Download recorded. Package ready.");
        fetchPackages();
      } else {
        toast.error(res.message ?? "Failed to download package");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setDownloadingSlug(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Extension SDK</h2>
          <p className="text-muted-foreground text-sm">
            Develop, publish, and manage extension packages
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Package
          </Button>
        )}
      </div>

      {/* ── Info Banner ──────────────────────────────────────────── */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          The Extension SDK lets you build custom extensions using TypeScript. Refer to the{" "}
          <span className="font-medium underline underline-offset-2 cursor-pointer">
            SDK documentation
          </span>{" "}
          for manifest format, permissions, and publishing guidelines.
        </AlertDescription>
      </Alert>

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Packages List ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available Packages</CardTitle>
          <CardDescription>All registered SDK packages</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : packages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Code2 className="text-muted-foreground mb-2 h-8 w-8" />
              <p className="text-muted-foreground text-sm">No SDK packages available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="flex items-center gap-4 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{pkg.name}</p>
                      <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
                        v{pkg.version}
                      </Badge>
                      {getStatusBadge(pkg.status)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      {pkg.author && <span>by {pkg.author}</span>}
                      <span className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        {pkg.downloads ?? 0}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => openView(pkg)}
                    >
                      <Eye className="mr-1.5 h-3 w-3" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      disabled={downloadingSlug === pkg.slug}
                      onClick={() => handleDownload(pkg.slug)}
                    >
                      {downloadingSlug === pkg.slug ? (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="mr-1.5 h-3 w-3" />
                      )}
                      Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Package Dialog ────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) resetCreateForm(); setCreateOpen(open); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Create SDK Package</DialogTitle>
            <DialogDescription>
              Register a new extension package with its manifest.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="pkg-name">Name</Label>
                <Input
                  id="pkg-name"
                  placeholder="my-extension"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pkg-slug">Slug</Label>
                <Input
                  id="pkg-slug"
                  placeholder="my-extension"
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value)}
                  className="bg-muted"
                  readOnly
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pkg-version">Version</Label>
                  <Input
                    id="pkg-version"
                    placeholder="1.0.0"
                    value={createVersion}
                    onChange={(e) => setCreateVersion(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pkg-author">Author</Label>
                  <Input
                    id="pkg-author"
                    placeholder="Your name"
                    value={createAuthor}
                    onChange={(e) => setCreateAuthor(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pkg-desc">Description</Label>
                <Input
                  id="pkg-desc"
                  placeholder="Brief description of the package"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pkg-manifest">Manifest (JSON)</Label>
                <Textarea
                  id="pkg-manifest"
                  className="min-h-40 font-mono text-xs"
                  value={createManifest}
                  onChange={(e) => setCreateManifest(e.target.value)}
                  placeholder="{}"
                />
                {manifestErrors.length > 0 && (
                  <div className="space-y-1">
                    {manifestErrors.map((err, i) => (
                      <p key={i} className="text-red-500 text-xs flex items-center gap-1">
                        <XCircle className="h-3 w-3 shrink-0" />
                        {err}
                      </p>
                    ))}
                  </div>
                )}
                {manifestErrors.length === 0 && createManifest.trim() && (
                  <p className="text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Manifest is valid
                  </p>
                )}
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetCreateForm(); setCreateOpen(false); }} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || manifestErrors.length > 0}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Package Dialog ──────────────────────────────────── */}
      <Dialog open={!!viewPkg} onOpenChange={(open) => !open && setViewPkg(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{viewPkg?.name ?? "Package Details"}</DialogTitle>
            <DialogDescription>{viewPkg?.description ?? "No description"}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {loadingView ? (
              <div className="space-y-3 py-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : viewPkg ? (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Version:</span>
                    <span className="ml-2 font-medium">{viewPkg.version}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <span className="ml-2">{getStatusBadge(viewPkg.status)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Author:</span>
                    <span className="ml-2 font-medium">{viewPkg.author ?? "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Downloads:</span>
                    <span className="ml-2 font-medium">{viewPkg.downloads ?? 0}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Manifest</Label>
                  <pre className="mt-1 rounded-lg bg-muted p-3 text-xs font-mono overflow-auto max-h-64">
                    {JSON.stringify(viewPkg.manifest, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
