import type { Href, Router } from 'expo-router';
import { APP_SCOPE, type AppScope } from '@/features/shell/app-scope';
import { ROUTES } from '@/navigation/routes';

/**
 * Vào app sau khi đăng nhập — ĐÓNG các màn chồng lên trên, không đẩy thêm màn nữa.
 *
 * `dismissAll()` gỡ mọi màn đã chồng lên nhóm tab và trả về đúng cái đang nằm dưới. KHÔNG dùng
 * `router.replace('/explore')` ở đây: nhóm `(tabs)` vốn đã nằm dưới màn đăng nhập (người dùng bấm
 * "Đăng nhập" từ chính trang chủ), nên lệnh đó dựng thêm một bản thứ hai của cả nhóm tab đè lên
 * bản cũ — hai cây điều hướng cùng sống, cùng giữ state, cùng render.
 *
 * `canDismiss()` là nhánh cho trường hợp màn đăng nhập là màn ĐẦU TIÊN (mở app bằng deep link
 * `/login`): lúc đó không có gì để đóng, phải điều hướng thật.
 *
 * Nằm ở `features/auth` chứ không trong file route: hai route dùng chung nó (`login` và
 * `set-password`), và một file trong `app/` xuất thêm hàm lạ là mời expo-router hiểu nhầm.
 *
 * Ba đích, theo thứ tự ưu tiên:
 *   1. `next` — deep link người dùng chủ động bấm để tới, thắng mọi mặc định;
 *   2. khu QUẢN LÝ — chỉ khi `resolveInitialScope` đã chốt như vậy;
 *   3. đóng chồng màn và trả về đúng cái đang nằm dưới (khu khách).
 */
export function enterApp(
  router: Router,
  options: {
    scope?: AppScope;
    /**
     * Đường dẫn deep link đang chờ. Là CHUỖI THÔ từ hệ điều hành, không dựng từ `ROUTES`, nên
     * typed routes của expo-router không kiểm được nó — phải ép kiểu ở đây chứ không ở nơi gọi.
     */
    next?: string | null;
  } = {},
): void {
  if (options.next) {
    router.replace(options.next as Href);
    return;
  }
  if (options.scope === APP_SCOPE.MANAGE) {
    router.replace(ROUTES.manage.home());
    return;
  }
  if (router.canDismiss()) router.dismissAll();
  else router.replace(ROUTES.explore.home());
}
