import type { Product, Supplier, PurchaseOrder, PurchaseOrderItem, ProductType } from "@/types/generated/database";

/** Request body for creating a product. */
export interface CreateProductRequest {
  workspaceId: string;
  name: string;
  sku?: string;
  barcode?: string;
  description?: string;
  productType?: ProductType;
  category?: string;
  unitPrice?: number;
  costPrice?: number;
  unit?: string;
  stockQuantity?: number;
  lowStockThreshold?: number;
  warehouseLocation?: string;
  supplierId?: string | null;
  tags?: string[];
  imageUrl?: string;
}

/** Request body for creating a supplier. */
export interface CreateSupplierRequest {
  workspaceId: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  notes?: string;
  tags?: string[];
}

/** Request body for creating a purchase order. */
export interface CreatePurchaseOrderRequest {
  workspaceId: string;
  supplierId: string;
  expectedDelivery?: string;
  notes?: string;
  currency?: string;
  items: {
    productId?: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
  }[];
}

/** Product joined with its optional supplier name. */
export type ProductWithSupplier = Product & {
  supplier?: { name: string };
};

/** Low-stock alert for a product. */
export interface InventoryAlert {
  product: Product;
  currentStock: number;
  threshold: number;
}

/** Aggregated inventory statistics. */
export interface InventoryStats {
  totalProducts: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

/** Standard action response. */
export interface InventoryActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

/** Paginated product list response. */
export interface ProductListResponse {
  data: ProductWithSupplier[];
  total: number;
  page: number;
  pageSize: number;
}

/** Filters for the product list query. */
export interface ProductListFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  productType?: string;
  supplierId?: string;
  lowStock?: boolean;
  activeOnly?: boolean;
}

/** Paginated supplier list response. */
export interface SupplierListResponse {
  data: Supplier[];
  total: number;
  page: number;
  pageSize: number;
}

/** Paginated purchase order list response. */
export interface PurchaseOrderListResponse {
  data: (PurchaseOrder & { items?: PurchaseOrderItem[]; supplier_name?: string })[];
  total: number;
  page: number;
  pageSize: number;
}

/** Stock adjustment types. */
export type StockAdjustmentType = "add" | "subtract" | "set";

/** Stock adjustment request. */
export interface StockAdjustmentRequest {
  quantity: number;
  adjustmentType: StockAdjustmentType;
}
