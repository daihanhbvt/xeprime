import { Redirect } from 'expo-router';

import { ROUTES, SHOP_SECTION } from '@/navigation/routes';

/**
 * ALIAS CHUYỂN TIẾP — "Hồ sơ người bán" thôi làm màn của chủ gian hàng, y như web.
 *
 * Từ PR #159 mã số thuế, loại chủ thể và tên pháp lý là khối "Thông tin khai thuế" của trang Cửa
 * hàng (web `/manage/shop/seller-profile` → `shopSectionPath(SHOP_SECTION.TAX)`); tài khoản nhận
 * tiền nằm ở trang Số dư.
 *
 * BACKEND GIỮ NGUYÊN: bảng `seller_profiles`, hàng đợi xác minh của nền tảng và quan hệ khấu trừ
 * thuế đều sống tiếp. Bản KHAI compact của cùng hồ sơ vẫn ở `/account/tax`.
 */
export default function ManageSellerProfileRedirectRoute() {
  return <Redirect href={ROUTES.manage.shop({ section: SHOP_SECTION.TAX })} />;
}
