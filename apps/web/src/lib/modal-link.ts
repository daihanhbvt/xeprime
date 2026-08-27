import type { MouseEvent } from 'react';

/**
 * Biến một `<Link>` thật thành "bấm thường thì mở MODAL, còn lại vẫn là link".
 *
 * Hai yêu cầu vốn kéo ngược nhau ở cổng quản lý:
 *   - người trực đang quét một danh sách đã lọc thì KHÔNG muốn bị đẩy sang route khác — mở
 *     overlay rồi đóng lại là đúng nhịp làm việc;
 *   - nhưng "xem hồ sơ xe/khách" cũng phải là một LIÊN KẾT THẬT: chuột phải → copy địa chỉ,
 *     Ctrl/Cmd+bấm → mở tab mới, và trình đọc màn hình nghe đúng "liên kết" chứ không phải một
 *     `div` bấm được.
 *
 * Giữ `href` và chỉ chặn cú bấm THƯỜNG được cả hai: hành vi mặc định của trình duyệt còn
 * nguyên ở mọi phím bổ trợ, còn cú bấm trái trần thì mở overlay.
 *
 * Trả về handler, không phải component: nơi gọi vẫn dùng `<Link href=…>` của Next nên không có
 * lớp bọc nào chen giữa và prefetch vẫn hoạt động bình thường.
 */
export function openOverlayOnPlainClick(
  open: () => void,
): (event: MouseEvent<HTMLElement>) => void {
  return (event) => {
    // Có phím bổ trợ / bấm chuột giữa ⇒ người dùng đang CỐ Ý mở tab mới: để trình duyệt lo.
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;

    event.preventDefault();
    open();
  };
}
