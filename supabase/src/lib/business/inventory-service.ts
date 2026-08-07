/**
 * Supa AI — Phase 10 inventory service (server-only).
 *
 * Owns the `products`, `suppliers`, and `purchase_orders` tables. Each
 * domain lives in its own service class so callers can request exactly
 * the surface they need.
 *
 * @module @/lib/business/inventory-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

import type {
  CreateProductInput,
  CreatePurchaseOrderInput,
  CreateSupplierInput,
  Product,
  PurchaseOrder,
  Supplier,
  UpdateProductInput,
  UpdatePurchaseOrderInput,
  UpdateSupplierInput,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  nextNumber,
  computeLineTotals,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

// ---------------------------------------------------------------------------
// ProductService
// ---------------------------------------------------------------------------

export class ProductService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: {
      search?: string;
      category?: string;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Product[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("products")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.category) query = query.eq("category", opts.category);
      if (typeof opts.isActive === "boolean") query = query.eq("is_active", opts.isActive);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,description.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "products.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing products.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    productId: string,
  ): Promise<Product> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("products")
        .select()
        .eq("id", productId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "products.get failed");
      if (!data) throw new NotFoundError("Product", productId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching product.", {
        productId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateProductInput,
  ): Promise<Product> {
    const name = input.name?.trim();
    if (!name) throw new ValidationError("Product name is required.");
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("products")
        .insert({
          workspace_id: workspaceId,
          name,
          sku: input.sku ?? null,
          description: input.description ?? null,
          price: input.price ?? 0,
          cost: input.cost ?? 0,
          currency: input.currency ?? "USD",
          stock: input.stock ?? 0,
          category: input.category ?? null,
          tags: input.tags ?? [],
          is_active: input.isActive ?? true,
          metadata: (input.metadata ?? null) as never,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "products.create failed");
      if (!data) throw new NotFoundError("Product create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating product.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    productId: string,
    input: UpdateProductInput,
  ): Promise<Product> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.sku !== undefined) patch.sku = input.sku;
    if (input.description !== undefined) patch.description = input.description;
    if (input.price !== undefined) patch.price = input.price;
    if (input.cost !== undefined) patch.cost = input.cost;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.stock !== undefined) patch.stock = input.stock;
    if (input.category !== undefined) patch.category = input.category;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    if (input.metadata !== undefined) patch.metadata = input.metadata as never;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("products")
        .update(patch as never)
        .eq("id", productId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "products.update failed");
      if (!data) throw new NotFoundError("Product", productId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating product.", {
        productId,
      });
    }
  }

  async delete(
    workspaceId: string,
    userId: string,
    productId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("products")
        .delete()
        .eq("id", productId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "products.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting product.", {
        productId,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// SupplierService
// ---------------------------------------------------------------------------

export class SupplierService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: {
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Supplier[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("suppliers")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "suppliers.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing suppliers.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    supplierId: string,
  ): Promise<Supplier> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("suppliers")
        .select()
        .eq("id", supplierId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "suppliers.get failed");
      if (!data) throw new NotFoundError("Supplier", supplierId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching supplier.", {
        supplierId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateSupplierInput,
  ): Promise<Supplier> {
    const name = input.name?.trim();
    if (!name) throw new ValidationError("Supplier name is required.");
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("suppliers")
        .insert({
          workspace_id: workspaceId,
          name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          company: input.company ?? null,
          contact_person: input.contactPerson ?? null,
          terms: input.terms ?? null,
          metadata: (input.metadata ?? null) as never,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "suppliers.create failed");
      if (!data) throw new NotFoundError("Supplier create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating supplier.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    supplierId: string,
    input: UpdateSupplierInput,
  ): Promise<Supplier> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.company !== undefined) patch.company = input.company;
    if (input.contactPerson !== undefined) patch.contact_person = input.contactPerson;
    if (input.terms !== undefined) patch.terms = input.terms;
    if (input.metadata !== undefined) patch.metadata = input.metadata as never;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("suppliers")
        .update(patch as never)
        .eq("id", supplierId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "suppliers.update failed");
      if (!data) throw new NotFoundError("Supplier", supplierId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating supplier.", {
        supplierId,
      });
    }
  }

  async delete(
    workspaceId: string,
    userId: string,
    supplierId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("suppliers")
        .delete()
        .eq("id", supplierId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "suppliers.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting supplier.", {
        supplierId,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// PurchaseOrderService
// ---------------------------------------------------------------------------

export class PurchaseOrderService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: {
      search?: string;
      status?: string;
      supplierId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<PurchaseOrder[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("purchase_orders")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.status) query = query.eq("status", opts.status);
      if (opts.supplierId) query = query.eq("supplier_id", opts.supplierId);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`number.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "purchase_orders.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing purchase orders.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    purchaseOrderId: string,
  ): Promise<PurchaseOrder> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("purchase_orders")
        .select()
        .eq("id", purchaseOrderId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "purchase_orders.get failed");
      if (!data) throw new NotFoundError("PurchaseOrder", purchaseOrderId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching purchase order.", {
        purchaseOrderId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreatePurchaseOrderInput,
  ): Promise<PurchaseOrder> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    const items = input.items ?? [];
    const totals = computeLineTotals(items, {
      tax: input.tax,
      discount: 0,
    });

    const number =
      input.number ??
      (await nextNumber(this.supabase, workspaceId, "purchase_orders", "PO"));

    try {
      const { data, error } = await this.supabase
        .from("purchase_orders")
        .insert({
          workspace_id: workspaceId,
          supplier_id: input.supplierId ?? null,
          number,
          status: input.status ?? "draft",
          issue_date: input.issueDate ?? new Date().toISOString().slice(0, 10),
          expected_date: input.expectedDate ?? null,
          subtotal: input.subtotal ?? totals.subtotal,
          tax: totals.tax,
          total: input.total ?? totals.total,
          currency: input.currency ?? "USD",
          items: (items as unknown[]) as never,
          created_by: userId,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "purchase_orders.create failed");
      if (!data) throw new NotFoundError("PurchaseOrder create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating purchase order.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    purchaseOrderId: string,
    input: UpdatePurchaseOrderInput,
  ): Promise<PurchaseOrder> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.supplierId !== undefined) patch.supplier_id = input.supplierId;
    if (input.number !== undefined) patch.number = input.number;
    if (input.status !== undefined) patch.status = input.status;
    if (input.issueDate !== undefined) patch.issue_date = input.issueDate;
    if (input.expectedDate !== undefined) patch.expected_date = input.expectedDate;
    if (input.currency !== undefined) patch.currency = input.currency;

    const moneyChanged =
      input.items !== undefined ||
      input.tax !== undefined ||
      input.subtotal !== undefined ||
      input.total !== undefined;
    if (moneyChanged) {
      const { data: existing, error: fetchErr } = await this.supabase
        .from("purchase_orders")
        .select()
        .eq("id", purchaseOrderId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (fetchErr) throw toDbError(fetchErr, "purchase_orders.update lookup failed");
      if (!existing) throw new NotFoundError("PurchaseOrder", purchaseOrderId);

      const items = input.items ?? ((existing.items ?? []) as never);
      const totals = computeLineTotals(items as never, {
        tax: input.tax ?? Number(existing.tax ?? 0),
        discount: 0,
      });
      patch.items = items;
      patch.subtotal = input.subtotal ?? totals.subtotal;
      patch.tax = totals.tax;
      patch.total = input.total ?? totals.total;
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("purchase_orders")
        .update(patch as never)
        .eq("id", purchaseOrderId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "purchase_orders.update failed");
      if (!data) throw new NotFoundError("PurchaseOrder", purchaseOrderId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating purchase order.", {
        purchaseOrderId,
      });
    }
  }

  async delete(
    workspaceId: string,
    userId: string,
    purchaseOrderId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("purchase_orders")
        .delete()
        .eq("id", purchaseOrderId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "purchase_orders.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting purchase order.", {
        purchaseOrderId,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export async function createProductService(): Promise<ProductService> {
  const supabase = await createSupabaseServerClient();
  return new ProductService(supabase);
}

export async function createSupplierService(): Promise<SupplierService> {
  const supabase = await createSupabaseServerClient();
  return new SupplierService(supabase);
}

export async function createPurchaseOrderService(): Promise<PurchaseOrderService> {
  const supabase = await createSupabaseServerClient();
  return new PurchaseOrderService(supabase);
}
