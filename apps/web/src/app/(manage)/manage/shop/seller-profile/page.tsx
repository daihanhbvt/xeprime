import { redirect } from 'next/navigation';

import { SHOP_SECTION, shopSectionPath } from '@/constants/routes';

/**
 * ALIAS CHUYỂN TIẾP (16/09/2026) — "Hồ sơ người bán" thôi làm màn riêng của chủ gian hàng.
 *
 * Màn cũ hỏi hai nhóm thứ, và cả hai đều đã có chỗ tốt hơn:
 *
 *   - Danh tính pháp lý (loại chủ thể, tên pháp lý, MST, số giấy tờ) → section "Thông tin khai
 *     thuế" của trang Cửa hàng (07/10/2026) — đích của redirect này, cùng component với "Hồ sơ chủ
 *     xe" của tuyến hoa hồng. Từ 16/09 tới 07/10 nó trỏ về "Địa chỉ & pháp lý", nơi chỉ có ô MST
 *     của `tenant_profiles` — bản sao mà không phép tính thuế nào đọc (đã gỡ).
 *   - Tài khoản nhận tiền, thứ chiếm nửa màn cũ → `bank_accounts` (trang "Số dư & rút tiền").
 *
 * BACKEND GIỮ NGUYÊN: bảng `seller_profiles`, hàng đợi xác minh của nền tảng, quan hệ khấu trừ thuế
 * và thông báo trạng thái đều sống tiếp. Đây là thay đổi ĐIỀU HƯỚNG.
 */
export default function ManageSellerProfileRedirectPage(): never {
  redirect(shopSectionPath(SHOP_SECTION.TAX));
}
