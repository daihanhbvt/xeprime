import { tenantUsesManagePortal } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import type { CurrentUser } from '@/hooks/use-current-user';

/**
 * Thành viên gian hàng tuyến gói mở một URL của khu KHÁCH — trả về đích tương đương, hoặc `null`
 * khi họ được ở lại.
 *
 * Hàm THUẦN, tách ra để test được mà không phải render cả vỏ. Bản đồ đi theo Ý ĐỊNH của người
 * dùng, không phải theo "cấm hết cho chắc":
 *
 *   `/account`, đổi mật khẩu, xoá tài khoản  → `/manage/account`        (Tài khoản & bảo mật)
 *   `/trips`, `/trips/<id>`                  → `/manage/account/trips…` (lối chuyển tiếp, vai thuê)
 *   công cụ cho thuê (xe, lịch, tiền, hộp thư…) → `/manage`             (nơi làm việc thật)
 *
 * ⚠️ Danh sách này KHÔNG liệt kê từng đường: mọi thứ dưới `/account` và `/trips` đều bị chặn, và
 * đích chỉ khác nhau ở ba nhóm trên. Liệt kê trắng từng route là cách để một route mới thêm vào
 * tháng sau lại thành cửa sau.
 *
 * `/trips/<id>` giữ nguyên `<id>` khi chuyển: liên kết trong email thông báo và tin nhắn đều có
 * dạng đó, và đổ hết chúng về một danh sách là bắt người dùng tự đi tìm lại chuyến mình vừa bấm.
 */
export function shopAccountRedirect(
  user: Pick<CurrentUser, 'tenant'>,
  pathname: string | null,
): string | null {
  if (!tenantUsesManagePortal(user.tenant ?? null)) return null;
  if (!pathname) return null;

  const inAccount = pathname === ROUTES.ACCOUNT.ROOT || pathname.startsWith(`${ROUTES.ACCOUNT.ROOT}/`);
  const inTrips = pathname === ROUTES.TRIPS || pathname.startsWith(`${ROUTES.TRIPS}/`);
  if (!inAccount && !inTrips) return null;

  // Chuyến đi vào lối chuyển tiếp, mang theo id nếu có.
  if (inTrips) {
    const id = pathname.slice(ROUTES.TRIPS.length + 1);
    return id ? `${ROUTES.MANAGE.ACCOUNT_TRIPS}/${id}` : ROUTES.MANAGE.ACCOUNT_TRIPS;
  }

  // Mọi thứ thuộc về CON NGƯỜI đi về một chỗ: Tài khoản & bảo mật.
  const PERSONAL: readonly string[] = [
    ROUTES.ACCOUNT.ROOT,
    ROUTES.ACCOUNT.CHANGE_PASSWORD,
    ROUTES.ACCOUNT.DELETE_ACCOUNT,
  ];
  if (PERSONAL.includes(pathname)) return ROUTES.MANAGE.ACCOUNT;

  // Còn lại là công cụ cho thuê — bản Manage của chúng nằm sau cổng quản lý.
  return ROUTES.MANAGE.ROOT;
}
