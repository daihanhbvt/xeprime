import type { Router } from 'expo-router';
import { logger } from '@/lib/logger';
import { ROUTES } from '@/navigation/routes';

/**
 * Rời app sau khi ĐĂNG XUẤT — gỡ sạch chồng màn rồi về chợ xe. Đối xứng với `enterApp`.
 *
 * ## Vì sao `router.replace` một mình là không đủ
 *
 * `replace` chỉ đổi màn TRÊN CÙNG. Đăng xuất từ trong khu quản lý thì bên dưới vẫn còn nguyên
 * ngăn xếp của khu đó — nhóm tab quản lý, `ScopeGuard` của nó, và mọi màn đã push lên. Chúng
 * không tháo, nên người dùng thấy đúng cái đã xảy ra: vẫn đứng ở `/manage/...`, kèm một màn
 * "Đăng nhập để quản lý gian hàng" — phiên đã chết nhưng cây điều hướng thì chưa ai dọn.
 *
 * `dismissAll()` gỡ chúng trước, `replace` sau đó mới thật sự đưa về gốc khu khách.
 *
 * `canDismiss()` là nhánh cho trường hợp không có gì để đóng (đăng xuất ngay ở màn gốc của một
 * tab): gọi `dismissAll` lúc đó là ném lỗi, chứ không phải không làm gì.
 *
 * KHÔNG đá về `/login`: XePrime là chợ xe công khai — phần lớn màn vẫn xem được khi chưa đăng
 * nhập, và bắt người vừa chủ động đăng xuất phải nhìn một form đăng nhập là hỏi lại đúng thứ họ
 * vừa từ chối. Web cũng đưa về trang chủ (`use-portal-logout`).
 *
 * Scope vỏ (khu khách / khu quản lý) do `SessionBoundary` dọn khi phiên kết thúc — không lặp lại
 * ở đây, vì nó phải chạy cho CẢ đường phiên chết vì refresh token bị từ chối.
 */
export function leaveApp(router: Router): void {
  /*
   * HAI lượt try RIÊNG, không phải một.
   *
   * Gộp chung là một lỗi đã xảy ra thật: `dismissAll()` ném thì `replace()` nằm cùng khối nên
   * bị bỏ qua hoàn toàn, và người vừa đăng xuất ở khu quản lý nằm lại đúng màn cần phiên —
   * `ScopeGuard` đổi nó thành "Vui lòng đăng nhập" rồi dừng ở đó. Dấu vết duy nhất là một
   * dòng `warn`. Gỡ chồng màn là việc DỌN DẸP; đưa về chợ xe là việc BẮT BUỘC, và cái sau không được
   * phụ thuộc vào cái trước.
   *
   * Cả hai đều bọc try vì hàm này chạy từ listener "phiên đã kết thúc", và listener đó có thể nổ
   * TRƯỚC khi cây điều hướng kịp mount: mở app bằng một refresh token đã bị thu hồi thì phiên
   * chết ngay ở khung hình đầu, lúc `router` còn chưa sẵn sàng và mọi lệnh đi đều ném
   * `assertIsReady`. Ném ở đó không chỉ mất cú điều hướng: listener chạy trong một vòng lặp
   * chung, nên lỗi này nuốt luôn phần dọn dẹp của những listener đứng sau.
   */
  try {
    if (router.canDismiss()) router.dismissAll();
  } catch (error) {
    logger.warn('Không gỡ được chồng màn khi phiên kết thúc', { error: String(error) });
  }

  try {
    router.replace(ROUTES.explore.home());
  } catch (error) {
    logger.warn('Chưa rời được màn sau khi phiên kết thúc', { error: String(error) });
  }
}
