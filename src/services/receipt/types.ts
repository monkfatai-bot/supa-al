import type {
  Receipt,
  PaymentMethod,
  PaymentProvider,
} from "@/types/generated/database";

/** Request payload for creating a new receipt. */
export interface CreateReceiptRequest {
  workspaceId: string;
  invoiceId?: string | null;
  customerId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentProvider?: PaymentProvider | null;
  paymentReference?: string | null;
  notes?: string | null;
}

/** Receipt enriched with optional invoice number. */
export type ReceiptWithInvoice = Receipt & {
  invoice?: { invoice_number: string } | null;
};

/** Paginated result for receipts. */
export interface ReceiptListResult {
  receipts: ReceiptWithInvoice[];
  total: number;
  page: number;
  pageSize: number;
}

/** Action response wrapper for receipt mutations. */
export interface ReceiptActionResponse {
  success: boolean;
  message: string;
  error?: string;
  receipt?: Receipt;
}

/** Verified receipt data returned from public verification endpoint. */
export interface VerifiedReceipt {
  receiptId: string;
  receiptNumber: string;
  amount: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
  verified: true;
  workspaceId: string;
}
