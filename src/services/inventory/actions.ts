"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logActivity } from "@/services/activity-log/actions";
import { logger } from "@/services/logger";
import { verifyWorkspaceMembership, requireMinimumRole } from "@/lib/workspace-utils";
import { PAGINATION } from "@/config/constants";
import type { ActivityAction, PurchaseOrderStatus, Product, Supplier, PurchaseOrder, PurchaseOrderItem } from "@/types/generated/database";
import type {
  CreateProductRequest,
  CreateSupplierRequest,
  CreatePurchaseOrderRequest,
  ProductWithSupplier,
  InventoryAlert,
  InventoryStats,
  InventoryActionResponse,
  ProductListResponse,
  ProductListFilters,
  SupplierListResponse,
  PurchaseOrderListResponse,
  StockAdjustmentRequest,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------



/** Enrich a product with its supplier name. */
async function enrichProductWithSupplier(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  product: Product
): Promise<ProductWithSupplier> {
  if (!product.supplier_id) {
    return product as ProductWithSupplier;
  }
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("name")
    .eq("id", product.supplier_id)
    .single();
  return {
    ...product,
    supplier: supplier ? { name: supplier.name } : undefined,
  };
}

// ===========================================================================
// PRODUCTS
// ===========================================================================

// ---------------------------------------------------------------------------
// Create Product
// ---------------------------------------------------------------------------

export async function createProduct(
  data: CreateProductRequest
): Promise<InventoryActionResponse & { product?: Product }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  if (!data.workspaceId || !data.name?.trim()) {
    return { success: false, message: "workspaceId and name are required.", error: "INVALID_INPUT" };
  }

  try { await requireMinimumRole(data.workspaceId, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      workspace_id: data.workspaceId,
      name: data.name.trim(),
      sku: data.sku ?? "",
      barcode: data.barcode ?? "",
      description: data.description ?? "",
      product_type: data.productType ?? "physical",
      category: data.category ?? "",
      unit_price: data.unitPrice ?? 0,
      cost_price: data.costPrice ?? 0,
      unit: data.unit ?? "piece",
      stock_quantity: data.stockQuantity ?? 0,
      low_stock_threshold: data.lowStockThreshold ?? 10,
      warehouse_location: data.warehouseLocation ?? "",
      supplier_id: data.supplierId ?? null,
      tags: data.tags ?? [],
      image_url: data.imageUrl ?? "",
      is_active: true,
      metadata: {},
      created_by: profile.id,
    })
    .select()
    .single();

  if (error || !product) {
    logger.error("Failed to create product", { reason: error?.message });
    return { success: false, message: "Failed to create product.", error: "CREATE_FAILED" };
  }

  logger.info("Product created", { productId: product.id, name: data.name });
  await logActivity(
    "product_create" as ActivityAction,
    `Created product: ${data.name}`,
    { productId: product.id, name: data.name },
    data.workspaceId
  );

  return { success: true, message: "Product created.", product };
}

// ---------------------------------------------------------------------------
// Update Product
// ---------------------------------------------------------------------------

export async function updateProduct(
  id: string,
  updates: {
    name?: string;
    sku?: string;
    barcode?: string;
    description?: string;
    productType?: string;
    category?: string;
    unitPrice?: number;
    costPrice?: number;
    unit?: string;
    lowStockThreshold?: number;
    warehouseLocation?: string;
    supplierId?: string | null;
    tags?: string[];
    imageUrl?: string;
  }
): Promise<InventoryActionResponse & { product?: Product }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("products")
    .select("id, workspace_id, name")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Product not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name.trim();
  if (updates.sku !== undefined) dbUpdates.sku = updates.sku;
  if (updates.barcode !== undefined) dbUpdates.barcode = updates.barcode;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.productType !== undefined) dbUpdates.product_type = updates.productType;
  if (updates.category !== undefined) dbUpdates.category = updates.category;
  if (updates.unitPrice !== undefined) dbUpdates.unit_price = updates.unitPrice;
  if (updates.costPrice !== undefined) dbUpdates.cost_price = updates.costPrice;
  if (updates.unit !== undefined) dbUpdates.unit = updates.unit;
  if (updates.lowStockThreshold !== undefined) dbUpdates.low_stock_threshold = updates.lowStockThreshold;
  if (updates.warehouseLocation !== undefined) dbUpdates.warehouse_location = updates.warehouseLocation;
  if (updates.supplierId !== undefined) dbUpdates.supplier_id = updates.supplierId;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.imageUrl !== undefined) dbUpdates.image_url = updates.imageUrl;

  const { data: product, error } = await supabase
    .from("products")
    .update(dbUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error || !product) {
    logger.error("Failed to update product", { id, reason: error?.message });
    return { success: false, message: "Failed to update product.", error: "UPDATE_FAILED" };
  }

  logger.info("Product updated", { productId: id });
  await logActivity(
    "product_update" as ActivityAction,
    `Updated product: ${existing.name}`,
    { productId: id },
    existing.workspace_id
  );

  return { success: true, message: "Product updated.", product };
}

// ---------------------------------------------------------------------------
// Delete Product (soft delete)
// ---------------------------------------------------------------------------

export async function deleteProduct(
  id: string
): Promise<InventoryActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("products")
    .select("id, workspace_id, name")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Product not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "admin"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { error } = await supabase
    .from("products")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.error("Failed to delete product", { id, reason: error.message });
    return { success: false, message: "Failed to delete product.", error: "DELETE_FAILED" };
  }

  logger.info("Product soft-deleted", { productId: id });
  await logActivity(
    "product_delete" as ActivityAction,
    `Deactivated product: ${existing.name}`,
    { productId: id },
    existing.workspace_id
  );

  return { success: true, message: "Product deactivated." };
}

// ---------------------------------------------------------------------------
// Get Products (paginated, filterable)
// ---------------------------------------------------------------------------

export async function getProducts(
  workspaceId: string,
  filters: ProductListFilters = {}
): Promise<ProductListResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const hasAccess = await verifyWorkspaceMembership(workspaceId, profile.id).catch(() => null);
  if (!hasAccess) {
    return { data: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
  }

  const page = filters.page ?? 1;
  const pageSize = Math.min(
    filters.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE,
    PAGINATION.MAX_PAGE_SIZE
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId);

  if (filters.activeOnly !== false) {
    query = query.eq("is_active", true);
  }

  if (filters.category) {
    query = query.eq("category", filters.category);
  }

  if (filters.productType) {
    query = query.eq("product_type", filters.productType);
  }

  if (filters.supplierId) {
    query = query.eq("supplier_id", filters.supplierId);
  }

  // Low stock filter is applied in-memory below (column comparison not supported in PostgREST)

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`name.ilike.${term},sku.ilike.${term},barcode.ilike.${term}`);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error || !data) {
    logger.error("Failed to fetch products", { workspaceId, reason: error?.message });
    return { data: [], total: 0, page, pageSize };
  }

  // Post-filter for lowStock if needed (since Supabase JS doesn't support column comparisons easily)
  let filtered = data;
  if (filters.lowStock) {
    filtered = data.filter((p) => p.stock_quantity <= p.low_stock_threshold);
  }

  // Enrich with supplier names
  const enriched: ProductWithSupplier[] = [];
  for (const product of filtered) {
    const withSupplier = await enrichProductWithSupplier(supabase, product);
    enriched.push(withSupplier);
  }

  return { data: enriched, total: count ?? 0, page, pageSize };
}

// ---------------------------------------------------------------------------
// Get Single Product
// ---------------------------------------------------------------------------

export async function getProduct(
  id: string
): Promise<InventoryActionResponse & { product?: ProductWithSupplier }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !product) {
    return { success: false, message: "Product not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(product.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const enriched = await enrichProductWithSupplier(supabase, product);
  return { success: true, message: "Product retrieved.", product: enriched };
}

// ---------------------------------------------------------------------------
// Update Stock
// ---------------------------------------------------------------------------

export async function updateStock(
  productId: string,
  adjustment: StockAdjustmentRequest
): Promise<InventoryActionResponse & { product?: Product }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  if (typeof adjustment.quantity !== "number" || adjustment.quantity < 0) {
    return { success: false, message: "Quantity must be a non-negative number.", error: "INVALID_INPUT" };
  }

  if (!["add", "subtract", "set"].includes(adjustment.adjustmentType)) {
    return { success: false, message: "adjustmentType must be 'add', 'subtract', or 'set'.", error: "INVALID_INPUT" };
  }

  const { data: existing } = await supabase
    .from("products")
    .select("id, workspace_id, name, stock_quantity, low_stock_threshold")
    .eq("id", productId)
    .single();

  if (!existing) {
    return { success: false, message: "Product not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  let newQuantity: number;
  const current = existing.stock_quantity;

  switch (adjustment.adjustmentType) {
    case "add":
      newQuantity = current + adjustment.quantity;
      break;
    case "subtract":
      newQuantity = Math.max(0, current - adjustment.quantity);
      break;
    case "set":
      newQuantity = adjustment.quantity;
      break;
  }

  const { data: product, error } = await supabase
    .from("products")
    .update({ stock_quantity: newQuantity, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .select()
    .single();

  if (error || !product) {
    logger.error("Failed to update stock", { productId, reason: error?.message });
    return { success: false, message: "Failed to update stock.", error: "UPDATE_FAILED" };
  }

  logger.info("Stock updated", {
    productId,
    type: adjustment.adjustmentType,
    from: current,
    to: newQuantity,
  });
  await logActivity(
    "stock_update" as ActivityAction,
    `Stock ${adjustment.adjustmentType} for ${existing.name}: ${current} → ${newQuantity}`,
    { productId, adjustmentType: adjustment.adjustmentType, from: current, to: newQuantity },
    existing.workspace_id
  );

  // Check low stock threshold
  if (newQuantity <= existing.low_stock_threshold && current > existing.low_stock_threshold) {
    logger.warn("Low stock alert", { productId, currentStock: newQuantity, threshold: existing.low_stock_threshold });
    await logActivity(
      "low_stock_alert" as ActivityAction,
      `Low stock alert: ${existing.name} is at ${newQuantity} (threshold: ${existing.low_stock_threshold})`,
      { productId, currentStock: newQuantity, threshold: existing.low_stock_threshold },
      existing.workspace_id
    );
  }

  return { success: true, message: "Stock updated.", product };
}

// ---------------------------------------------------------------------------
// Get Low Stock Alerts
// ---------------------------------------------------------------------------

export async function getLowStockAlerts(
  workspaceId: string
): Promise<InventoryActionResponse & { alerts?: InventoryAlert[] }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);

  if (error || !data) {
    logger.error("Failed to fetch low stock alerts", { workspaceId, reason: error?.message });
    return { success: false, message: "Failed to fetch low stock alerts.", error: "QUERY_FAILED" };
  }

  // Filter in JS for column comparison (stock_quantity <= low_stock_threshold)
  const alerts: InventoryAlert[] = data
    .filter((p) => p.stock_quantity <= p.low_stock_threshold)
    .map((p) => ({
      product: p,
      currentStock: p.stock_quantity,
      threshold: p.low_stock_threshold,
    }));

  return { success: true, message: "Low stock alerts retrieved.", alerts };
}

// ---------------------------------------------------------------------------
// Search Products
// ---------------------------------------------------------------------------

export async function searchProducts(
  workspaceId: string,
  query: string
): Promise<ProductWithSupplier[]> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  if (!query?.trim()) {
    return [];
  }

  const hasAccess = await verifyWorkspaceMembership(workspaceId, profile.id).catch(() => null);
  if (!hasAccess) {
    return [];
  }

  const term = `%${query.trim()}%`;
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .or(`name.ilike.${term},sku.ilike.${term},barcode.ilike.${term}`)
    .limit(20);

  if (error || !data) {
    logger.error("Failed to search products", { workspaceId, query, reason: error?.message });
    return [];
  }

  const results: ProductWithSupplier[] = [];
  for (const product of data) {
    const enriched = await enrichProductWithSupplier(supabase, product);
    results.push(enriched);
  }

  return results;
}

// ===========================================================================
// SUPPLIERS
// ===========================================================================

// ---------------------------------------------------------------------------
// Create Supplier
// ---------------------------------------------------------------------------

export async function createSupplier(
  data: CreateSupplierRequest
): Promise<InventoryActionResponse & { supplier?: Supplier }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  if (!data.workspaceId || !data.name?.trim()) {
    return { success: false, message: "workspaceId and name are required.", error: "INVALID_INPUT" };
  }

  try { await requireMinimumRole(data.workspaceId, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .insert({
      workspace_id: data.workspaceId,
      name: data.name.trim(),
      contact_name: data.contactName ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
      address: data.address ?? "",
      website: data.website ?? "",
      notes: data.notes ?? "",
      tags: data.tags ?? [],
      created_by: profile.id,
    })
    .select()
    .single();

  if (error || !supplier) {
    logger.error("Failed to create supplier", { reason: error?.message });
    return { success: false, message: "Failed to create supplier.", error: "CREATE_FAILED" };
  }

  logger.info("Supplier created", { supplierId: supplier.id, name: data.name });
  await logActivity(
    "supplier_create" as ActivityAction,
    `Created supplier: ${data.name}`,
    { supplierId: supplier.id, name: data.name },
    data.workspaceId
  );

  return { success: true, message: "Supplier created.", supplier };
}

// ---------------------------------------------------------------------------
// Update Supplier
// ---------------------------------------------------------------------------

export async function updateSupplier(
  id: string,
  updates: {
    name?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
    website?: string;
    notes?: string;
    tags?: string[];
  }
): Promise<InventoryActionResponse & { supplier?: Supplier }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("suppliers")
    .select("id, workspace_id, name")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Supplier not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name.trim();
  if (updates.contactName !== undefined) dbUpdates.contact_name = updates.contactName;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.address !== undefined) dbUpdates.address = updates.address;
  if (updates.website !== undefined) dbUpdates.website = updates.website;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .update(dbUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error || !supplier) {
    logger.error("Failed to update supplier", { id, reason: error?.message });
    return { success: false, message: "Failed to update supplier.", error: "UPDATE_FAILED" };
  }

  logger.info("Supplier updated", { supplierId: id });
  await logActivity(
    "supplier_update" as ActivityAction,
    `Updated supplier: ${existing.name}`,
    { supplierId: id },
    existing.workspace_id
  );

  return { success: true, message: "Supplier updated.", supplier };
}

// ---------------------------------------------------------------------------
// Delete Supplier
// ---------------------------------------------------------------------------

export async function deleteSupplier(
  id: string
): Promise<InventoryActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("suppliers")
    .select("id, workspace_id, name")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Supplier not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "admin"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Check if supplier is referenced by active products
  const { count: productCount } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", id)
    .eq("is_active", true);

  if (productCount && productCount > 0) {
    return {
      success: false,
      message: `Cannot delete supplier — ${productCount} active product(s) reference this supplier.`,
      error: "REFERENCED",
    };
  }

  const { error } = await supabase.from("suppliers").delete().eq("id", id);

  if (error) {
    logger.error("Failed to delete supplier", { id, reason: error.message });
    return { success: false, message: "Failed to delete supplier.", error: "DELETE_FAILED" };
  }

  logger.info("Supplier deleted", { supplierId: id });
  await logActivity(
    "supplier_delete" as ActivityAction,
    `Deleted supplier: ${existing.name}`,
    { supplierId: id },
    existing.workspace_id
  );

  return { success: true, message: "Supplier deleted." };
}

// ---------------------------------------------------------------------------
// Get Suppliers (paginated)
// ---------------------------------------------------------------------------

export async function getSuppliers(
  workspaceId: string,
  filters: { page?: number; pageSize?: number; search?: string } = {}
): Promise<SupplierListResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const hasAccess = await verifyWorkspaceMembership(workspaceId, profile.id).catch(() => null);
  if (!hasAccess) {
    return { data: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
  }

  const page = filters.page ?? 1;
  const pageSize = Math.min(
    filters.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE,
    PAGINATION.MAX_PAGE_SIZE
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("suppliers")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId);

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`name.ilike.${term},contact_name.ilike.${term},email.ilike.${term}`);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error || !data) {
    logger.error("Failed to fetch suppliers", { workspaceId, reason: error?.message });
    return { data: [], total: 0, page, pageSize };
  }

  return { data, total: count ?? 0, page, pageSize };
}

// ---------------------------------------------------------------------------
// Get Single Supplier
// ---------------------------------------------------------------------------

export async function getSupplier(
  id: string
): Promise<InventoryActionResponse & { supplier?: Supplier }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !supplier) {
    return { success: false, message: "Supplier not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(supplier.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  return { success: true, message: "Supplier retrieved.", supplier };
}

// ===========================================================================
// PURCHASE ORDERS
// ===========================================================================

// ---------------------------------------------------------------------------
// Create Purchase Order
// ---------------------------------------------------------------------------

export async function createPurchaseOrder(
  data: CreatePurchaseOrderRequest
): Promise<InventoryActionResponse & { purchaseOrder?: PurchaseOrder }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  if (!data.workspaceId || !data.supplierId || !data.items?.length) {
    return { success: false, message: "workspaceId, supplierId, and at least one item are required.", error: "INVALID_INPUT" };
  }

  try { await requireMinimumRole(data.workspaceId, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Verify supplier exists in this workspace
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", data.supplierId)
    .eq("workspace_id", data.workspaceId)
    .single();

  if (!supplier) {
    return { success: false, message: "Supplier not found in this workspace.", error: "NOT_FOUND" };
  }

  // Generate PO number: PO-YYYYMMDD-XXXX
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const poNumber = `PO-${dateStr}-${randomSuffix}`;

  // Calculate subtotal
  const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = 0; // No tax calculation in this context — can be added later
  const total = subtotal + taxAmount;
  const currency = data.currency ?? "USD";

  // Insert the PO
  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      workspace_id: data.workspaceId,
      supplier_id: data.supplierId,
      po_number: poNumber,
      status: "draft",
      order_date: now.toISOString().split("T")[0],
      subtotal,
      tax_amount: taxAmount,
      total,
      currency,
      expected_delivery: data.expectedDelivery ?? null,
      notes: data.notes ?? "",
      tags: [],
      created_by: profile.id,
    })
    .select()
    .single();

  if (poError || !po) {
    logger.error("Failed to create purchase order", { reason: poError?.message });
    return { success: false, message: "Failed to create purchase order.", error: "CREATE_FAILED" };
  }

  // Insert PO items
  const itemsToInsert = data.items.map((item, index) => ({
    purchase_order_id: po.id,
    product_id: item.productId ?? null,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total: item.quantity * item.unitPrice,
    received_quantity: 0,
    sort_order: index,
  }));

  const { error: itemsError } = await supabase
    .from("purchase_order_items")
    .insert(itemsToInsert);

  if (itemsError) {
    logger.error("Failed to create purchase order items", { poId: po.id, reason: itemsError.message });
    // Roll back: delete the PO
    await supabase.from("purchase_orders").delete().eq("id", po.id);
    return { success: false, message: "Failed to create purchase order items.", error: "CREATE_FAILED" };
  }

  logger.info("Purchase order created", { poId: po.id, poNumber, total });
  await logActivity(
    "po_create" as ActivityAction,
    `Created purchase order ${poNumber} (${data.items.length} items, total: ${total})`,
    { poId: po.id, poNumber, itemCount: data.items.length, total },
    data.workspaceId
  );

  return { success: true, message: "Purchase order created.", purchaseOrder: po };
}

// ---------------------------------------------------------------------------
// Update Purchase Order Status
// ---------------------------------------------------------------------------

export async function updatePurchaseOrderStatus(
  id: string,
  status: PurchaseOrderStatus
): Promise<InventoryActionResponse & { purchaseOrder?: PurchaseOrder }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const validStatuses: PurchaseOrderStatus[] = ["draft", "submitted", "approved", "ordered", "received", "cancelled"];
  if (!validStatuses.includes(status)) {
    return { success: false, message: `Invalid status: ${status}.`, error: "INVALID_INPUT" };
  }

  const { data: existing } = await supabase
    .from("purchase_orders")
    .select("id, workspace_id, po_number, status")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Purchase order not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data: po, error } = await supabase
    .from("purchase_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error || !po) {
    logger.error("Failed to update PO status", { id, reason: error?.message });
    return { success: false, message: "Failed to update purchase order status.", error: "UPDATE_FAILED" };
  }

  logger.info("PO status updated", { poId: id, from: existing.status, to: status });
  await logActivity(
    "po_status_update" as ActivityAction,
    `Updated PO ${existing.po_number}: ${existing.status} → ${status}`,
    { poId: id, from: existing.status, to: status },
    existing.workspace_id
  );

  return { success: true, message: `Purchase order status set to ${status}.`, purchaseOrder: po };
}

// ---------------------------------------------------------------------------
// Receive Purchase Order
// ---------------------------------------------------------------------------

export async function receivePurchaseOrder(
  id: string
): Promise<InventoryActionResponse & { purchaseOrder?: PurchaseOrder }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Fetch the PO
  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (poError || !po) {
    return { success: false, message: "Purchase order not found.", error: "NOT_FOUND" };
  }

  if (po.status === "received") {
    return { success: false, message: "Purchase order has already been received.", error: "INVALID_STATUS" };
  }

  if (po.status === "cancelled") {
    return { success: false, message: "Cannot receive a cancelled purchase order.", error: "INVALID_STATUS" };
  }

  try { await requireMinimumRole(po.workspace_id, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Fetch PO items
  const { data: items, error: itemsError } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("purchase_order_id", id);

  if (itemsError || !items) {
    logger.error("Failed to fetch PO items for receiving", { poId: id, reason: itemsError?.message });
    return { success: false, message: "Failed to fetch PO items.", error: "QUERY_FAILED" };
  }

  // Update each item's received_quantity to the full ordered quantity
  for (const item of items) {
    const pendingReceive = item.quantity - item.received_quantity;
    if (pendingReceive > 0) {
      await supabase
        .from("purchase_order_items")
        .update({ received_quantity: item.quantity })
        .eq("id", item.id);

      // Update product stock if product_id is linked
      if (item.product_id) {
        const { data: product } = await supabase
          .from("products")
          .select("id, name, stock_quantity, low_stock_threshold")
          .eq("id", item.product_id)
          .single();

        if (product) {
          const newStock = product.stock_quantity + pendingReceive;
          await supabase
            .from("products")
            .update({ stock_quantity: newStock, updated_at: new Date().toISOString() })
            .eq("id", product.id);

          await logActivity(
            "stock_update" as ActivityAction,
            `Received ${pendingReceive} units of ${product.name} (PO ${po.po_number}), stock: ${product.stock_quantity} → ${newStock}`,
            { productId: product.id, from: product.stock_quantity, to: newStock, poId: id },
            po.workspace_id
          );

          // Check low stock threshold after update
          if (newStock <= product.low_stock_threshold && product.stock_quantity > product.low_stock_threshold) {
            await logActivity(
              "low_stock_alert" as ActivityAction,
              `Low stock alert: ${product.name} is at ${newStock} (threshold: ${product.low_stock_threshold})`,
              { productId: product.id, currentStock: newStock, threshold: product.low_stock_threshold },
              po.workspace_id
            );
          }
        }
      }
    }
  }

  // Set PO status to received
  const { data: updatedPo, error: updateError } = await supabase
    .from("purchase_orders")
    .update({ status: "received", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updateError || !updatedPo) {
    logger.error("Failed to mark PO as received", { poId: id, reason: updateError?.message });
    return { success: false, message: "Failed to mark purchase order as received.", error: "UPDATE_FAILED" };
  }

  logger.info("Purchase order received", { poId: id, poNumber: po.po_number, itemCount: items.length });
  await logActivity(
    "po_received" as ActivityAction,
    `Received purchase order ${po.po_number} (${items.length} items)`,
    { poId: id, poNumber: po.po_number, itemCount: items.length },
    po.workspace_id
  );

  return { success: true, message: "Purchase order received and stock updated.", purchaseOrder: updatedPo };
}

// ---------------------------------------------------------------------------
// Get Purchase Orders (paginated)
// ---------------------------------------------------------------------------

export async function getPurchaseOrders(
  workspaceId: string,
  filters: { page?: number; pageSize?: number; status?: string; supplierId?: string } = {}
): Promise<PurchaseOrderListResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const hasAccess = await verifyWorkspaceMembership(workspaceId, profile.id).catch(() => null);
  if (!hasAccess) {
    return { data: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
  }

  const page = filters.page ?? 1;
  const pageSize = Math.min(
    filters.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE,
    PAGINATION.MAX_PAGE_SIZE
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("purchase_orders")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.supplierId) {
    query = query.eq("supplier_id", filters.supplierId);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error || !data) {
    logger.error("Failed to fetch purchase orders", { workspaceId, reason: error?.message });
    return { data: [], total: 0, page, pageSize };
  }

  // Enrich each PO with supplier name
  const enriched = await Promise.all(
    data.map(async (po) => {
      const { data: supplier } = await supabase
        .from("suppliers")
        .select("name")
        .eq("id", po.supplier_id)
        .single();
      return { ...po, supplier_name: supplier?.name }; 
    })
  );

  return { data: enriched, total: count ?? 0, page, pageSize };
}

// ---------------------------------------------------------------------------
// Get Single Purchase Order (with items and supplier name)
// ---------------------------------------------------------------------------

export async function getPurchaseOrder(
  id: string
): Promise<InventoryActionResponse & { purchaseOrder?: PurchaseOrder & { items?: PurchaseOrderItem[]; supplier_name?: string } }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: po, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !po) {
    return { success: false, message: "Purchase order not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(po.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Fetch items
  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("purchase_order_id", id)
    .order("sort_order", { ascending: true });

  // Fetch supplier name
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("name")
    .eq("id", po.supplier_id)
    .single();

  return {
    success: true,
    message: "Purchase order retrieved.",
    purchaseOrder: {
      ...po,
      items: items ?? [],
      supplier_name: supplier?.name,
    },
  };
}

// ===========================================================================
// INVENTORY STATS
// ===========================================================================

// ---------------------------------------------------------------------------
// Get Inventory Stats
// ---------------------------------------------------------------------------

export async function getInventoryStats(
  workspaceId: string
): Promise<InventoryActionResponse & { stats?: InventoryStats }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Fetch all active products
  const { data: products, error } = await supabase
    .from("products")
    .select("id, unit_price, stock_quantity, low_stock_threshold, is_active")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);

  if (error || !products) {
    logger.error("Failed to fetch products for stats", { workspaceId, reason: error?.message });
    return { success: false, message: "Failed to compute inventory stats.", error: "QUERY_FAILED" };
  }

  const totalProducts = products.length;
  const totalValue = products.reduce((sum, p) => sum + p.unit_price * p.stock_quantity, 0);
  const lowStockCount = products.filter((p) => p.stock_quantity <= p.low_stock_threshold && p.stock_quantity > 0).length;
  const outOfStockCount = products.filter((p) => p.stock_quantity === 0).length;

  const stats: InventoryStats = {
    totalProducts,
    totalValue,
    lowStockCount,
    outOfStockCount,
  };

  return { success: true, message: "Inventory stats computed.", stats };
}
