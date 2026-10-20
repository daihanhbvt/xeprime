import { PAYMENT_PAGE_PATH, PAYMENT_RETURN_PARAM, parseNativeTripReturn } from '@xeprime/types';

/**
 * Deep link quay về từ cổng MoMo/VNPAY ⇒ màn THANH TOÁN của chuyến (`/payment/<id>`), như web.
 *
 * Trang quay về công khai giữ tiền tố `xeprime://trips/<id>` vì bản app CŨ chờ đúng tiền tố đó để
 * đóng trình duyệt; nó nối thêm `paymentOrder` khi có lượt cổng. Chỉ deep link mang lượt cổng hợp lệ
 * mới bị đổi hướng — link chuyến thường (thông báo, chia sẻ) đi tiếp như cũ. Không đọc kết quả gì từ
 * URL: màn thanh toán tự hỏi server trạng thái của lượt (ADR 0058). Phép đọc (cả phép chặn ULID)
 * dùng chung với trang quay về của web: `parseNativeTripReturn` ở `@xeprime/types`.
 */
export function gatewayReturnRedirect(path: string): string | null {
  const parsed = parseNativeTripReturn(path);
  if (!parsed) return null;
  const { tripId, orderId } = parsed;
  return `${PAYMENT_PAGE_PATH}/${tripId}?${PAYMENT_RETURN_PARAM.TRIP_ORDER}=${orderId}`;
}
