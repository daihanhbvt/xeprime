import type { Router } from 'expo-router';
import { ROUTES } from '@/navigation/routes';

/**
 * Vào app sau khi đăng nhập — ĐÓNG các màn chồng lên trên, không đẩy thêm màn nữa.
 *
 * `dismissAll()` gỡ mọi màn đã chồng lên nhóm tab và trả về đúng cái đang nằm dưới. Trước đây
 * chỗ này gọi `router.replace('/explore')`: vì nhóm `(tabs)` VỐN ĐÃ nằm dưới màn đăng nhập
 * (người dùng bấm "Đăng nhập" từ chính trang chủ), lệnh đó dựng thêm một bản thứ hai của cả
 * nhóm tab đè lên bản cũ — hai cây điều hướng cùng sống, cùng giữ state, cùng render.
 *
 * `canDismiss()` là nhánh cho trường hợp màn đăng nhập là màn ĐẦU TIÊN (mở app bằng deep link
 * `/login`): lúc đó không có gì để đóng, phải điều hướng thật.
 *
 * Nằm ở `features/auth` chứ không trong file route: hai route dùng chung nó (`login` và
 * `set-password`), và một file trong `app/` xuất thêm hàm lạ là mời expo-router hiểu nhầm.
 */
export function enterApp(router: Router): void {
  if (router.canDismiss()) router.dismissAll();
  else router.replace(ROUTES.explore.home());
}
