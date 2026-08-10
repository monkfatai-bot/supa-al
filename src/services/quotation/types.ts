import type {
  Quotation,
  QuotationItem,
} from "@/types/generated/database";

/**
 * Quotation with its line items and optional customer name (from join).
 */
export type QuotationWithItems = Quotation & {
  items?: QuotationItem[];
  customer?: { name: string };
};

/**
 * A single line-item used when creating / updating a quotation.
 */
export interface QuotationItemList {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercent: number;
  total: number;
}

/**
 * Payload for creating a new quotation.
 */
export interface CreateQuotationRequest {
  workspaceId: string;
  customerId: string;
  companyId?: string;
  validUntil?: string;
  currency?: string;
  notes?: string;
  terms?: string;
  items: QuotationItemList[];
  taxRate?: number;
  discountAmount?: number;
}
