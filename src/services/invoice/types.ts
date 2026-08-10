import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  PaymentMethod,
  PaymentProvider,
} from "@/types/generated/database";

/**
 * Invoice with its line items and optional customer name (from join).
 */
export type InvoiceWithItems = Invoice & {
  items?: InvoiceItem[];
  customer?: { name: string };
};

/**
 * A single line-item used when creating / updating an invoice.
 */
export interface InvoiceItemList {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercent: number;
  total: number;
}

/**
 * Payload for creating a new invoice.
 */
export interface CreateInvoiceRequest {
  workspaceId: string;
  customerId: string;
  companyId?: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  notes?: string;
  terms?: string;
  items: InvoiceItemList[];
  taxRate?: number;
  discountAmount?: number;
}

/**
 * Payload for updating an invoice's payment status.
 */
export interface UpdateInvoiceStatusRequest {
  status: InvoiceStatus;
  paidDate?: string;
  paymentMethod?: PaymentMethod;
  paymentProvider?: PaymentProvider;
  paymentReference?: string;
}

/**
 * Aggregated dashboard statistics for invoices.
 */
export interface InvoiceDashboardStats {
  totalRevenue: number;
  outstandingAmount: number;
  overdueCount: number;
  paidThisMonth: number;
}
