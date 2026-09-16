import { redirect } from 'next/navigation';

import { SHOP_SECTION, shopSectionPath } from '@/constants/routes';

/**
 * ALIAS CHUYỂN TIẾP (16/09/2026) — "Hồ sơ người bán" thôi làm màn của chủ gian hàng.
 *
 * Màn cũ hỏi hai nhóm thứ, và cả hai đều đã có chỗ tốt hơn:
 *
 *   - Danh tính pháp lý (loại chủ thể, tên pháp lý, MST, số giấy tờ) → section "Địa chỉ & pháp
 *     lý" của trang Cửa hàng — đích của redirect này.
 *   - Tài khoản nhận tiền, thứ chiếm nửa màn cũ → `bank_accounts` (section "Tài khoản nhận
 *     tiền"). Ba cột ngân hàng trên `seller_profiles` đã drop: chúng chưa bao giờ được lệnh rút
 *     đọc, nên gian hàng điền xong vẫn không rút được tiền.
 *
 * BACKEND GIỮ NGUYÊN và đó là điểm chính: bảng `seller_profiles`, hàng đợi xác minh của nền
 * tảng (`/manage/admin/sellers`), quan hệ khấu trừ thuế và thông báo trạng thái đều sống tiếp.
 * Đây là thay đổi ĐIỀU HƯỚNG — hồ sơ vẫn tồn tại, chỉ không còn là một mục trong menu của chủ
 * shop khi chưa có gate nào bắt họ phải khai.
 */
export default function ManageSellerProfileRedirectPage(): never {
  redirect(shopSectionPath(SHOP_SECTION.LEGAL));
}
