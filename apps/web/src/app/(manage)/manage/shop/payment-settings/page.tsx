import { redirect } from 'next/navigation';
import { ROUTES, SHOP_POLICIES_DEPOSIT_ANCHOR } from '@/constants/routes';

/**
 * ALIAS CHUYỂN TIẾP (16/09/2026) — "Thanh toán giữ chỗ qua XePrime" thôi làm trang độc lập.
 *
 * Cả trang cũ chỉ có đúng một công tắc, nên nó về làm một section của "Chính sách thuê" — nơi
 * gian hàng vốn đã tới để chỉnh tiền cọc/thế chấp nhận trực tiếp. Route cũ giữ lại dưới dạng
 * redirect kèm hash để ai đã bookmark rơi thẳng vào đúng phần đó, không phải đầu trang.
 *
 * Không còn mục menu nào trỏ tới đây; đây là đường vào của lịch sử, không phải của giao diện.
 */
export default function ShopPaymentSettingsRedirectPage(): never {
  redirect(`${ROUTES.MANAGE.SHOP_POLICIES}#${SHOP_POLICIES_DEPOSIT_ANCHOR}`);
}
