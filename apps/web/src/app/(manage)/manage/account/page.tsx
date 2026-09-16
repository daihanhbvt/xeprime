import { redirect } from 'next/navigation';

import { ROUTES } from '@/constants/routes';

/**
 * ALIAS CHUYỂN TIẾP (16/09/2026) — "Tài khoản & bảo mật" tách làm hai nửa đúng nghĩa.
 *
 * Trang cũ trộn ba thứ khác loại: hồ sơ CON NGƯỜI (tên, ảnh đại diện), BẢO MẬT (mật khẩu, xoá
 * tài khoản) và một thẻ lối vào gian hàng. Nay:
 *
 *   - Bảo mật → `/manage/security` (đích của redirect này): phương thức đăng nhập, đổi mật
 *     khẩu, vùng nguy hiểm. Đây là thứ người ta thật sự vào `/manage/account` để làm.
 *   - Tên và ảnh đại diện cá nhân → `/account` ở khu marketplace. Trong Manage, hình đại diện
 *     nổi bật là LOGO GIAN HÀNG (xem `ManageUserCard`), nên một ô sửa avatar cá nhân ở đây chỉ
 *     dựng ra một tấm ảnh thứ hai không màn nào trong cổng hiển thị.
 *   - Lối tới chuyến ĐI THUÊ cũ → menu tài khoản, hiện đúng khi còn chuyến chưa khép.
 *
 * `/manage/account/trips` KHÔNG bị redirect: nó là route con và Next khớp nó trước route này.
 */
export default function ManageAccountRedirectPage(): never {
  redirect(ROUTES.MANAGE.SECURITY);
}
