import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiGet, apiPost, fetchPage, type Paged } from '@/services/api-client';
import type {
  MySubscription,
  PaymentInfo,
  PurchaseSubscriptionInput,
  SubscriptionInvoice,
  TenantPlan,
} from './types';

export const INVOICES_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export const fetchMySubscription = (): Promise<MySubscription> =>
  apiGet<MySubscription>('/subscription');

export const fetchTenantPlans = (): Promise<TenantPlan[]> =>
  apiGet<TenantPlan[]>('/subscription/plans');

/** Tài khoản nhận chuyển khoản của nền tảng — nguồn dựng ảnh VietQR (ADR 0016 điều 5). */
export const fetchPaymentInfo = (): Promise<PaymentInfo> =>
  apiGet<PaymentInfo>('/subscription/payment-info');

export type InvoiceListResult = Paged<SubscriptionInvoice>;

export const fetchInvoices = (page = 1): Promise<InvoiceListResult> =>
  fetchPage<SubscriptionInvoice>(
    '/subscription/invoices',
    { page, limit: INVOICES_DEFAULT_LIMIT },
    INVOICES_DEFAULT_LIMIT,
  );

/** Mua/gia hạn: trả về HOÁ ĐƠN (mã đối soát) — gói chỉ kích hoạt khi tiền về (ADR 0026 điều 4). */
export const purchaseSubscription = (
  body: PurchaseSubscriptionInput,
): Promise<SubscriptionInvoice> => apiPost<SubscriptionInvoice>('/subscription/purchase', body);
