import { Redirect } from 'expo-router';

import { ROUTES } from '@/navigation/routes';

/**
 * ALIAS CHUYỂN TIẾP — "Thanh toán giữ chỗ qua XePrime" thôi làm màn độc lập, y như web.
 *
 * Cả màn cũ chỉ có đúng MỘT công tắc, nên nó về làm một khối của "Chính sách thuê" — nơi gian
 * hàng vốn đã tới để chỉnh tiền cọc/thế chấp. Đường cũ giữ lại vì thông báo đẩy và liên kết sâu
 * đã phát ra ngoài trỏ vào nó; đây là đường vào của lịch sử, không còn mục menu nào tới đây.
 */
export default function ManageShopPaymentSettingsRedirectRoute() {
  return <Redirect href={ROUTES.manage.shopPolicies()} />;
}
