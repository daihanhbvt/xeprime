import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiGet, apiPost, fetchPage, type Paged } from '@/services/api-client';
import type {
  CreateSubscriptionCheckoutInput,
  MySubscription,
  PaymentInfo,
  PendingSubscriptionInvoice,
  PurchaseSubscriptionInput,
  PurchaseSubscriptionRequest,
  SubscriptionCheckout,
  SubscriptionPurchasePreview,
  SubscriptionInvoice,
  TenantPlan,
} from './types';

export const INVOICES_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export const fetchMySubscription = (): Promise<MySubscription> =>
  apiGet<MySubscription>('/subscription');

export const fetchTenantPlans = (): Promise<TenantPlan[]> =>
  apiGet<TenantPlan[]>('/subscription/plans');

/** Tài khoản nhận chuyển khoản của nền tảng - nguồn dựng ảnh VietQR (ADR 0016 điều 5). */
export const fetchPaymentInfo = (): Promise<PaymentInfo> =>
  apiGet<PaymentInfo>('/subscription/payment-info');

/**
 * Hoá đơn gói ĐANG chờ tiền - tối đa MỘT mỗi phạm vi loại xe, mới nhất trước; rỗng khi không có
 * (ADR 0040 · ADR 0065).
 *
 * Endpoint riêng thay vì lọc trang đầu của `fetchInvoices`: bất biến "mỗi phạm vi tối đa MỘT hoá
 * đơn trả được" do server giữ (unique một phần + void hoá đơn cũ cùng phạm vi trong `purchase`),
 * nên câu trả lời phải đến từ đó. Lọc ở client biến bất biến thành một giả định, và một lịch sử dài
 * hơn một trang sẽ đẩy hoá đơn chờ ra khỏi tầm nhìn.
 *
 * Đọc `invoices`, không đọc `invoice`: trường đơn chỉ là phần tử đầu, giữ cho client cũ - gian hàng
 * vừa tạo hoá đơn xe máy lẫn ô tô sẽ mất một mã nếu web đọc nó.
 */
export const fetchPendingInvoices = (): Promise<SubscriptionInvoice[]> =>
  apiGet<PendingSubscriptionInvoice>('/subscription/invoices/pending').then(
    (r) => r.invoices ?? (r.invoice ? [r.invoice] : []),
  );

/**
 * MỘT hoá đơn của gian hàng, ở MỌI trạng thái - nguồn của trang thanh toán `/payment/:invoiceId`.
 * Trang đó phải nói đúng kết cục của chính hoá đơn trên đường dẫn (chờ / đã trả / đã huỷ), điều mà
 * `fetchPendingInvoice` không trả lời được: trả xong là nó thành `null`, y như hoá đơn đã huỷ.
 */
export const fetchInvoice = (id: string): Promise<SubscriptionInvoice> =>
  apiGet<SubscriptionInvoice>(`/subscription/invoices/${encodeURIComponent(id)}`);

export type InvoiceListResult = Paged<SubscriptionInvoice>;

export const fetchInvoices = (page = 1): Promise<InvoiceListResult> =>
  fetchPage<SubscriptionInvoice>(
    '/subscription/invoices',
    { page, limit: INVOICES_DEFAULT_LIMIT },
    INVOICES_DEFAULT_LIMIT,
  );

/** Mua/gia hạn: trả về HOÁ ĐƠN (mã đối soát) - gói chỉ kích hoạt khi tiền về (ADR 0026 điều 4). */
export const purchaseSubscription = (
  body: PurchaseSubscriptionRequest,
): Promise<SubscriptionInvoice> => apiPost<SubscriptionInvoice>('/subscription/purchase', body);

/** Mua gói ô tô + gói xe máy trong MỘT lần chuyển khoản - phiếu `XPC…` (ADR 0083). */
export const createSubscriptionCheckout = (
  body: CreateSubscriptionCheckoutInput,
): Promise<SubscriptionCheckout> =>
  apiPost<SubscriptionCheckout>('/subscription/checkouts', body);

/** Xem trước một lượt mua (ADR 0084) - server suy gia hạn / nâng ngay / đổi từ kỳ sau. Không ghi gì. */
export const previewSubscriptionPurchase = (
  items: readonly PurchaseSubscriptionInput[],
): Promise<SubscriptionPurchasePreview> =>
  apiPost<SubscriptionPurchasePreview>('/subscription/purchase/preview', { items });

export const fetchSubscriptionCheckout = (id: string): Promise<SubscriptionCheckout> =>
  apiGet<SubscriptionCheckout>(`/subscription/checkouts/${encodeURIComponent(id)}`);
