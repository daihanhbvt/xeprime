import { PAYMENT_RETURN_PARAM } from '@xeprime/types';
import { nativeTripHref } from '@/features/payment-gateway/native-trip-return';

/**
 * Điểm quay về CÔNG KHAI sau khi trả tiền giữ chỗ qua MoMo/VNPAY từ app XePrime (ADR 0058).
 *
 * Cổng chỉ nhận `returnUrl` http(s), còn trình duyệt app mở (Custom Tab / ASWebAuthenticationSession)
 * không có cookie phiên. Trước đây đây là một TRANG React: khách thấy dấu tích xanh "đang quay lại"
 * trong lúc chờ JS hydrate rồi mới bị chuyển — và dấu tích nói "thành công" cả khi khách vừa bấm Huỷ
 * ở cổng. Giờ server trả 302 thẳng sang deep link: trình duyệt gặp scheme của app và đóng ngay, KHÔNG
 * vẽ gì. Không gọi API, không nói kết quả — màn thanh toán trong app tự hỏi server trạng thái lượt.
 *
 * Link hỏng (không phải ULID) ⇒ về trang chủ; không bao giờ ghép tham số lạ vào deep link.
 */
export function GET(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const href = nativeTripHref(
    params.get(PAYMENT_RETURN_PARAM.NATIVE_TRIP),
    params.get(PAYMENT_RETURN_PARAM.TRIP_ORDER),
  );
  return new Response(null, {
    status: 302,
    headers: {
      Location: href ?? '/',
      // Mỗi lượt một đích riêng — không để proxy/trình duyệt dùng lại lượt chuyển hướng cũ.
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
