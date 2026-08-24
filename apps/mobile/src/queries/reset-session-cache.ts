import type { QueryClient } from '@tanstack/react-query';

/**
 * Xoá mọi dữ liệu gắn với phiên. Gọi khi đăng nhập, đăng xuất và khi phiên hết hạn.
 *
 * `resetQueries()` chứ KHÔNG `clear()`: `clear()` gỡ hẳn query khỏi cache, nên observer đang
 * mounted giữ nguyên kết quả cũ và không ai bảo nó chạy lại — màn hình vẫn hiện dữ liệu của
 * phiên đã chết. `resetQueries()` vừa bỏ dữ liệu vừa fetch lại các query đang hoạt động, nên
 * `useCurrentUser` nhận 401 và cổng `(app)` chuyển sang `unauthenticated`.
 *
 * Đặt ở tầng dùng chung chứ không trong feature auth: khi có dữ liệu công khai không phụ thuộc
 * phiên (danh sách tỉnh, cấu hình app, banner), nơi quyết định giữ lại cái gì là ở đây.
 */
export function resetSessionScopedCache(queryClient: QueryClient): void {
  void queryClient.resetQueries();
}
