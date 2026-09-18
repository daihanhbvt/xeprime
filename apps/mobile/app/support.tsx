import { PublicSupportScreen } from '@/features/support/PublicSupportScreen';

/**
 * Trung tâm hỗ trợ CÔNG KHAI — `/support`, không bọc `RequireSession`.
 *
 * Người cần kênh liên hệ nhất (kẹt giữa chuyến, mất điện thoại đã đăng nhập) chính là người ít có
 * khả năng đăng nhập nhất. Quy chế sàn cũng viện dẫn thẳng địa chỉ này, nên nó phải mở được từ một
 * liên kết trong văn bản mà không qua cổng nào.
 */
export default function SupportRoute() {
  return <PublicSupportScreen />;
}
