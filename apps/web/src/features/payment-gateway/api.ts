import { apiGet, apiPost } from '@/services/api-client';
import {
  PAYMENT_SURFACE,
  type GatewayTarget,
  type PaymentGatewayMethods,
  type PaymentOrder,
  type PaymentSurface,
  type StartGatewayCheckoutInput,
} from './types';

/**
 * Gốc endpoint theo bề mặt — site khách dùng realm `customer`, site partner dùng realm `partner`
 * (ADR 0053). Một bảng thay vì `if` rải ở từng hàm: thêm một đường đọc là thêm một dòng.
 */
const BASE: Readonly<Record<PaymentSurface, string>> = {
  [PAYMENT_SURFACE.CUSTOMER]: '/account/payment-gateway',
  [PAYMENT_SURFACE.PARTNER]: '/subscription/payment-gateway',
};

/** Phương thức cổng đang mở cho luồng của bề mặt này — rỗng khi chưa cấu hình/chưa bật. */
export const fetchGatewayMethods = (surface: PaymentSurface): Promise<PaymentGatewayMethods> =>
  apiGet<PaymentGatewayMethods>(`${BASE[surface]}/methods`);

/**
 * Trạng thái MỘT lượt — trang quay về đọc cái này. Server tự hỏi cổng khi lượt còn chờ quá lâu, nên
 * kết quả không bao giờ đến từ tham số mà cổng gắn lên URL quay về.
 */
export const fetchGatewayOrder = (surface: PaymentSurface, orderId: string): Promise<PaymentOrder> =>
  apiGet<PaymentOrder>(`${BASE[surface]}/orders/${encodeURIComponent(orderId)}`);

/**
 * Mở phiên thanh toán — KHÔNG gửi số tiền hay mã: server đọc cả hai từ DB theo khoản trên đường dẫn.
 * Trả về lượt (có `checkoutUrl` để chuyển trang), hoặc chính lượt còn hạn nếu đã mở trước đó.
 */
export function startGatewayCheckout(
  target: GatewayTarget,
  body: StartGatewayCheckoutInput,
): Promise<PaymentOrder> {
  return target.kind === 'trip'
    ? apiPost<PaymentOrder>(
        `${BASE[PAYMENT_SURFACE.CUSTOMER]}/trips/${encodeURIComponent(target.tripId)}/checkout`,
        body,
      )
    : apiPost<PaymentOrder>(
        `${BASE[PAYMENT_SURFACE.PARTNER]}/invoices/${encodeURIComponent(target.invoiceId)}/checkout`,
        body,
      );
}
