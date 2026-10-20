import {
  buildNativeTripReturnUrl,
  isUlid,
  MOBILE_APP_SCHEME,
  MOBILE_CLIENT_APP,
} from '@xeprime/types';

/**
 * Deep link quay về app. Giữ `xeprime://trips/<id>` làm TIỀN TỐ: app đã cài truyền đúng chuỗi đó cho
 * `openAuthSessionAsync`, và Android chỉ đóng trình duyệt khi URL BẮT ĐẦU bằng nó — đổi tiền tố là
 * treo trình duyệt ở mọi bản app cũ. Lượt cổng (`paymentOrder`) hợp lệ thì nối thêm: bản app mới
 * chuyển deep link này sang màn thanh toán `/payment/<id>` (như web), bản cũ vẫn mở trang chuyến.
 */
export function nativeTripHref(
  tripId: string | null | undefined,
  orderId?: string | null,
): string | null {
  // Chặn mọi thứ không phải ULID trước khi ghép vào deep link.
  if (!isUlid(tripId)) return null;
  return buildNativeTripReturnUrl(
    MOBILE_APP_SCHEME[MOBILE_CLIENT_APP.CUSTOMER],
    tripId,
    isUlid(orderId) ? orderId : null,
  );
}
