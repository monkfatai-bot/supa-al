"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  DollarSign,
  AlertTriangle,
  XCircle,
  Plus,
  Search,
  Loader2,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getInventoryStats,
  getLowStockAlerts,
  getProducts,
  createProduct,
  updateStock,
} from "@/services/inventory";
import type {
  InventoryStats,
  InventoryAlert,
  ProductWithSupplier,
  CreateProductRequest,
} from "@/services/inventory";

interface InventoryDashboardProps {
  workspaceId: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function StatCard({
  title,
  value,
  icon: Icon,
  variant,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  variant: "default" | "warning" | "danger" | "success";
}) {
  const colorMap = {
    default: "bg-blue-500/10 text-blue-600",
    success: "bg-green-500/10 text-green-600",
    warning: "bg-amber-500/10 text-amber-600",
    danger: "bg-red-500/10 text-red-600",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${colorMap[variant]}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{title}</p>
          <p className="text-xl font-bold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function InventoryDashboard({ workspaceId }: InventoryDashboardProps) {
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [products, setProducts] = useState<ProductWithSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // Add product dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<CreateProductRequest>>({});
  const [creating, setCreating] = useState(false);

  // Stock update dialog
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState<ProductWithSupplier | null>(null);
  const [stockQty, setStockQty] = useState(0);
  const [stockAdjustType, setStockAdjustType] = useState<"add" | "subtract">("add");
  const [stockUpdating, setStockUpdating] = useState(false);

  // Categories derived from products
  const [categories, setCategories] = useState<string[]>([]);

  const fetchStats = useCallback(async () => {
    try {
      const s = await getInventoryStats(workspaceId);
      if (s.success && s.stats) setStats(s.stats);
    } catch {
      toast.error("Failed to load inventory stats");
    }
  }, [workspaceId]);

  const fetchAlerts = useCallback(async () => {
    try {
      const a = await getLowStockAlerts(workspaceId);
      if (a.success && a.alerts) setAlerts(a.alerts);
    } catch {
      toast.error("Failed to load low stock alerts");
    }
  }, [workspaceId]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProducts(workspaceId, {
        page,
        pageSize,
        search: search || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        activeOnly: false,
      });
      setProducts(res.data);
      setTotal(res.total);
      // Derive categories
      const cats = new Set<string>();
      res.data.forEach((p) => {
        if (p.category) cats.add(p.category);
      });
      setCategories(Array.from(cats).sort());
    } catch {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, search, categoryFilter]);

  useEffect(() => {
    fetchStats();
    fetchAlerts();
  }, [fetchStats, fetchAlerts]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  async function handleAddProduct() {
    if (!newProduct.name?.trim()) {
      toast.error("Product name is required");
      return;
    }
    setCreating(true);
    try {
      const res = await createProduct({
        workspaceId,
        name: newProduct.name.trim(),
        sku: newProduct.sku,
        category: newProduct.category,
        unitPrice: newProduct.unitPrice,
        costPrice: newProduct.costPrice,
        unit: newProduct.unit,
        stockQuantity: newProduct.stockQuantity ?? 0,
        lowStockThreshold: newProduct.lowStockThreshold ?? 5,
        description: newProduct.description,
      });
      if (res.success) {
        toast.success("Product created");
        setAddDialogOpen(false);
        setNewProduct({});
        fetchProducts();
        fetchStats();
        fetchAlerts();
      } else {
        toast.error(res.message || "Failed to create product");
      }
    } catch {
      toast.error("Failed to create product");
    } finally {
      setCreating(false);
    }
  }

  function openStockDialog(product: ProductWithSupplier) {
    setStockProduct(product);
    setStockQty(0);
    setStockAdjustType("add");
    setStockDialogOpen(true);
  }

  async function handleUpdateStock() {
    if (!stockProduct || stockQty <= 0) return;
    setStockUpdating(true);
    try {
      const res = await updateStock(stockProduct.id, {
        quantity: stockQty,
        adjustmentType: stockAdjustType,
      });
      if (res.success) {
        toast.success("Stock updated");
        setStockDialogOpen(false);
        fetchProducts();
        fetchStats();
        fetchAlerts();
      } else {
        toast.error(res.message || "Failed to update stock");
      }
    } catch {
      toast.error("Failed to update stock");
    } finally {
      setStockUpdating(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground text-sm">Products, stock levels, and low-stock alerts.</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Product</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label htmlFor="prod-name">Name *</Label>
                <Input
                  id="prod-name"
                  placeholder="Product name"
                  value={newProduct.name || ""}
                  onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="prod-sku">SKU</Label>
                  <Input
                    id="prod-sku"
                    placeholder="SKU-001"
                    value={newProduct.sku || ""}
                    onChange={(e) => setNewProduct((p) => ({ ...p, sku: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="prod-category">Category</Label>
                  <Input
                    id="prod-category"
                    placeholder="e.g. Electronics"
                    value={newProduct.category || ""}
                    onChange={(e) => setNewProduct((p) => ({ ...p, category: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="prod-price">Unit Price</Label>
                  <Input
                    id="prod-price"
                    type="number"
                    placeholder="0.00"
                    value={newProduct.unitPrice || ""}
                    onChange={(e) =>
                      setNewProduct((p) => ({ ...p, unitPrice: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="prod-cost">Cost Price</Label>
                  <Input
                    id="prod-cost"
                    type="number"
                    placeholder="0.00"
                    value={newProduct.costPrice || ""}
                    onChange={(e) =>
                      setNewProduct((p) => ({ ...p, costPrice: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="prod-stock">Stock Quantity</Label>
                  <Input
                    id="prod-stock"
                    type="number"
                    placeholder="0"
                    value={newProduct.stockQuantity ?? ""}
                    onChange={(e) =>
                      setNewProduct((p) => ({ ...p, stockQuantity: parseInt(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="prod-threshold">Low Stock Threshold</Label>
                  <Input
                    id="prod-threshold"
                    type="number"
                    placeholder="5"
                    value={newProduct.lowStockThreshold ?? ""}
                    onChange={(e) =>
                      setNewProduct((p) => ({
                        ...p,
                        lowStockThreshold: parseInt(e.target.value) || 5,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="prod-unit">Unit</Label>
                <Input
                  id="prod-unit"
                  placeholder="pcs"
                  value={newProduct.unit || ""}
                  onChange={(e) => setNewProduct((p) => ({ ...p, unit: e.target.value }))}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleAddProduct}
                disabled={creating || !newProduct.name?.trim()}
              >
                {creating ? "Creating..." : "Create Product"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Products" value={String(stats?.totalProducts ?? 0)} icon={Package} variant="default" />
        <StatCard title="Total Value" value={formatCurrency(stats?.totalValue ?? 0)} icon={DollarSign} variant="success" />
        <StatCard title="Low Stock" value={String(stats?.lowStockCount ?? 0)} icon={AlertTriangle} variant="warning" />
        <StatCard title="Out of Stock" value={String(stats?.outOfStockCount ?? 0)} icon={XCircle} variant="danger" />
      </div>

      {/* Low Stock Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Low Stock Alerts
            </CardTitle>
            <CardDescription>Products below their threshold</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Current Stock</TableHead>
                  <TableHead className="text-center">Threshold</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert, i) => {
                  const outOfStock = alert.currentStock === 0;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{alert.product.name}</TableCell>
                      <TableCell className="text-center">{alert.currentStock}</TableCell>
                      <TableCell className="text-center">{alert.threshold}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={outOfStock ? "destructive" : "secondary"}>
                          {outOfStock ? "Out of Stock" : "Low Stock"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Products Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Products</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 h-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-44 h-9">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : products.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">No products found.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => {
                      const isLow = product.stock_quantity <= product.low_stock_threshold;
                      const isOut = product.stock_quantity === 0;
                      return (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{product.sku || "—"}</TableCell>
                          <TableCell>{product.category || "—"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(product.unit_price)}</TableCell>
                          <TableCell className="text-center">{product.stock_quantity}</TableCell>
                          <TableCell className="text-center">
                            {isOut ? (
                              <Badge variant="destructive">Out</Badge>
                            ) : isLow ? (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Low</Badge>
                            ) : (
                              <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">In Stock</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => openStockDialog(product)}>
                              <ArrowUpDown className="mr-1 h-3 w-3" />
                              Stock
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-muted-foreground text-xs">{total} products</p>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Stock Update Dialog */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm">
              <span className="font-medium">{stockProduct?.name}</span>
              <span className="text-muted-foreground ml-2">
                (current: {stockProduct?.stock_quantity ?? 0})
              </span>
            </p>
            <div className="flex gap-3">
              <Button
                variant={stockAdjustType === "add" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setStockAdjustType("add")}
              >
                + Add
              </Button>
              <Button
                variant={stockAdjustType === "subtract" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setStockAdjustType("subtract")}
              >
                − Subtract
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="stock-qty">Quantity</Label>
              <Input
                id="stock-qty"
                type="number"
                min={1}
                value={stockQty}
                onChange={(e) => setStockQty(parseInt(e.target.value) || 0)}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleUpdateStock}
              disabled={stockUpdating || stockQty <= 0}
            >
              {stockUpdating ? "Updating..." : "Update Stock"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
