import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

/** Type sinh từ OpenAPI (ADR 0007) — bản native của `apps/web/src/features/payment-gateway`. */
type Schemas = components['schemas'];

export type PaymentGatewayMethods = Schemas['PaymentGatewayMethodsDto'];
export type PaymentGatewayMethod = Schemas['PaymentGatewayMethodDto'];
export type PaymentOrder = Schemas['PaymentOrderDto'];
export type StartGatewayCheckoutInput = Schemas['StartGatewayCheckoutDto'];

/**
 * Bề mặt của người trả (ADR 0053/0058). App khách chỉ dùng `customer` (tiền giữ chỗ). `partner`
 * (hoá đơn gói) giữ nguyên hợp đồng để không lệch với web, nhưng app Partner CHƯA hiện lối này —
 * mua gói trong app store đi qua IAP (xem `features/payment-gateway/README` trong báo cáo đồng bộ).
 */
export const PAYMENT_SURFACE = {
  CUSTOMER: 'customer',
  PARTNER: 'partner',
} as const;

export type PaymentSurface = (typeof PAYMENT_SURFACE)[keyof typeof PAYMENT_SURFACE];

const BASE: Readonly<Record<PaymentSurface, string>> = {
  [PAYMENT_SURFACE.CUSTOMER]: '/account/payment-gateway',
  [PAYMENT_SURFACE.PARTNER]: '/subscription/payment-gateway',
};

export const paymentGatewayApi = {
  /** Phương thức cổng đang mở — rỗng khi chưa cấu hình/chưa bật (mặc định TẮT, ADR 0058). */
  methods(surface: PaymentSurface): Promise<PaymentGatewayMethods> {
    return getApiClient().get<PaymentGatewayMethods>(`${BASE[surface]}/methods`);
  },

  /** Trạng thái một lượt — nguồn DUY NHẤT của kết quả; không đọc gì từ URL cổng chuyển về. */
  order(surface: PaymentSurface, orderId: string): Promise<PaymentOrder> {
    return getApiClient().get<PaymentOrder>(
      `${BASE[surface]}/orders/${encodeURIComponent(orderId)}`,
    );
  },

  /** Mở phiên cho tiền giữ chỗ của chuyến — KHÔNG gửi số tiền/mã: server đọc từ DB. */
  startTripCheckout(tripId: string, body: StartGatewayCheckoutInput): Promise<PaymentOrder> {
    return getApiClient().post<PaymentOrder>(
      `${BASE[PAYMENT_SURFACE.CUSTOMER]}/trips/${encodeURIComponent(tripId)}/checkout`,
      body,
    );
  },
};
