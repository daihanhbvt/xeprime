import type { Href } from 'expo-router';
import { tenantUsesManagePortal } from '@xeprime/types';
import type { CurrentUser } from '@/features/auth/api';
import { ROUTES } from '@/navigation/routes';

const path = (href: Href): string => (typeof href === 'string' ? href : String(href.pathname));

/**
 * Cổng URL của khu KHÁCH cho một tài khoản gian hàng tuyến gói (ADR 0038 điều 7).
 *
 * ## Vì sao ẩn menu là chưa đủ
 *
 * Ẩn một mục mà để đường dẫn mở được là để lại cửa sau, và người dùng tìm thấy nó bằng BOOKMARK
 * CŨ hoặc một thông báo đẩy cũ chứ không bằng ý đồ xấu. Deny-by-default: chặn cả nhánh rồi mới
 * chừa ra, chứ không liệt kê trắng từng route — một màn thêm vào tháng sau sẽ lặng lẽ thành lối
 * vào.
 *
 * ## Khác web đúng một chỗ, và có lý do
 *
 * Web đẩy `/account`, `/account/change-password`, `/account/delete-account` sang `/manage/account`
 * vì bên đó `/manage/account` TỰ DỰNG lại ba khối ấy trên một trang cuộn.
 *
 * App native thì ngược: `/manage/account` là một MỤC LỤC trỏ về chính ba màn này (xem
 * `ManageAccountScreen`), nên đẩy chúng sang đó tạo một vòng lặp chuyển hướng. Ba màn cá nhân vì
 * vậy được CHO QUA — chúng là đích thật của lối vào trong khu quản lý.
 *
 * Luật nghiệp vụ giữ nguyên 100%: một tài khoản gian hàng không chạm được vào công cụ CHO THUÊ
 * của khu khách, cũng không mở được danh sách chuyến phía khách.
 */
export function shopAccountRedirect(
  user: Pick<CurrentUser, 'tenant'> | null | undefined,
  pathname: string | null,
): Href | null {
  if (!tenantUsesManagePortal(user?.tenant ?? null)) return null;
  if (!pathname) return null;

  const accountRoot = path(ROUTES.account.home());
  const tripsRoot = path(ROUTES.booking.list());

  const inAccount = pathname === accountRoot || pathname.startsWith(`${accountRoot}/`);
  const inTrips = pathname === tripsRoot || pathname.startsWith(`${tripsRoot}/`);
  if (!inAccount && !inTrips) return null;

  /*
   * Chuyến đi vào lối CHUYỂN TIẾP. Không mang id sang: bản native của lối này là một danh sách
   * khoá vai `renter` (`/manage/account/trips`), và nó chưa có màn chi tiết riêng — đẩy thẳng một
   * id vào đó sẽ mở một route không tồn tại.
   */
  if (inTrips) return ROUTES.manage.accountTrips();

  // Ba màn của CON NGƯỜI: cho qua, vì chính khu quản lý dẫn tới đây (xem docblock trên).
  const personal: readonly string[] = [
    accountRoot,
    path(ROUTES.account.changePassword()),
    path(ROUTES.account.deleteAccount()),
  ];
  if (personal.includes(pathname)) return null;

  // Còn lại là công cụ cho thuê — bản Manage của chúng nằm sau cổng quản lý.
  return ROUTES.manage.home();
}
