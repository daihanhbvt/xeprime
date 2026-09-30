import { Redirect } from 'expo-router';

import { ROUTES } from '@/navigation/routes';

/**
 * ALIAS CHUYỂN TIẾP — "Hồ sơ người bán" thôi làm màn của chủ gian hàng, y như web.
 *
 * Màn cũ hỏi hai nhóm thứ và cả hai đã có chỗ tốt hơn: danh tính pháp lý (MST, giấy phép) nằm ở
 * khối "Địa chỉ & pháp lý" của màn Cửa hàng — đích của chuyển hướng này — còn tài khoản nhận
 * tiền nằm ở sổ `bank_accounts` (khối "Tài khoản nhận tiền", cũng trong màn Cửa hàng).
 *
 * BACKEND GIỮ NGUYÊN: bảng `seller_profiles`, hàng đợi xác minh của nền tảng và quan hệ khấu trừ
 * thuế đều sống tiếp. Bản KHAI compact của cùng hồ sơ vẫn ở `/account/tax`.
 */
export default function ManageSellerProfileRedirectRoute() {
  return <Redirect href={ROUTES.manage.shop()} />;
}
