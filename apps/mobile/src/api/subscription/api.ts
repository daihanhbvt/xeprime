import type { components } from '@xeprime/types';
import { getApiClient, type Paged } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Type màn "Gói của tôi" lấy từ contract OpenAPI (ADR 0007) — không viết tay DTO. */
export type MySubscription = Schemas['MySubscriptionDto'];
export type TenantPlan = Schemas['TenantPlanDto'];
export type SubscriptionInvoice = Schemas['SubscriptionInvoiceDto'];
export type PurchaseSubscriptionInput = Schemas['PurchaseSubscriptionDto'];
export type SlotUsage = Schemas['SlotUsageDto'];
export type PaymentInfo = Schemas['PaymentInfoDto'];

/** Cùng cỡ trang với web để hai bên lật lịch sử hoá đơn cùng nhịp. */
export const INVOICES_DEFAULT_LIMIT = 20;

export type InvoicePage = Paged<SubscriptionInvoice>;

export const subscriptionApi = {
  me(): Promise<MySubscription> {
    return getApiClient().get<MySubscription>('/subscription');
  },

  plans(): Promise<TenantPlan[]> {
    return getApiClient().get<TenantPlan[]>('/subscription/plans');
  },

  /** Tài khoản nhận chuyển khoản của nền tảng — nguồn dựng mã VietQR (ADR 0016 điều 5). */
  paymentInfo(): Promise<PaymentInfo> {
    return getApiClient().get<PaymentInfo>('/subscription/payment-info');
  },

  invoices(page = 1): Promise<InvoicePage> {
    return getApiClient().fetchPage<SubscriptionInvoice>(
      '/subscription/invoices',
      { page, limit: INVOICES_DEFAULT_LIMIT },
      INVOICES_DEFAULT_LIMIT,
    );
  },

  /**
   * Mua/gia hạn — trả về HOÁ ĐƠN mang mã đối soát, KHÔNG phải một gói đã bật.
   *
   * Gói chỉ kích hoạt khi tiền thật về và SePay đối soát khớp mã (ADR 0026 điều 4). Client không
   * bao giờ được tự coi là đã mua xong sau khi lệnh này trả về.
   */
  purchase(body: PurchaseSubscriptionInput): Promise<SubscriptionInvoice> {
    return getApiClient().post<SubscriptionInvoice>('/subscription/purchase', body);
  },
};
