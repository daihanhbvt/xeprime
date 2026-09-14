import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';

/**
 * Những nhánh dữ liệu mà MỘT thông báo có thể vừa làm đổi.
 *
 * Bài toán: bản chiếu huy hiệu (`user_badges/{uid}`) chỉ mang CON SỐ — nó nói "có thêm một thông
 * báo chưa đọc", không nói nó về chuyện gì. Loại chỉ đọc được từ `GET /notifications`, mà danh
 * sách đó chỉ tải khi người dùng MỞ chuông; tới lúc biết được loại thì đã quá muộn để làm mới
 * màn đang xem.
 *
 * Triệu chứng khi thiếu: khách nhận thông báo "chuyến đã bị huỷ", con số trên chuông nhảy ngay,
 * nhưng danh sách chuyến vẫn còn nguyên dòng đó cho tới khi họ tự tải lại trang. Hai thứ trên
 * cùng một màn nói hai điều khác nhau, và thứ sai lại là thứ người dùng tin.
 *
 * Làm mới RỘNG là an toàn, và đây là lý do: `invalidateQueries` chỉ TẢI LẠI những query đang có
 * observer (màn hình đang mở); phần còn lại chỉ bị đánh dấu là cũ và sẽ tự tải ở lần dùng kế
 * tiếp. Nên chi phí thật là **tối đa một request cho tab đang mở**, không phải một request cho
 * mỗi nhánh.
 *
 * Cố ý KHÔNG có ở đây:
 *  - `notifications` và `chat` — hai nhánh đó có tín hiệu RIÊNG chính xác hơn
 *    (`notificationsUnread`, `chatCustomer`/`chatShop`), và đã được nối ở đúng hook của chúng
 *    (`use-notifications.ts`, `use-conversations.ts`). Gộp vào đây là làm mới hai lần cho một
 *    sự kiện;
 *  - `vehicles`, `finance`, `subscription` — thông báo của chúng (duyệt xe, gói sắp hết hạn)
 *    không đổi thứ người dùng đang nhìn theo cách khiến màn hình nói sai.
 */
const NOTIFICATION_AFFECTED: readonly QueryKey[] = [
  /**
   * Chuyến của KHÁCH và đơn của GIAN HÀNG — cùng một vòng đời, hai bề mặt.
   *
   * Cả hai chứ không chọn một: cùng một tài khoản có thể đang mở bất kỳ bên nào (chủ xe tự thuê
   * xe của người khác là chuyện bình thường), nên không suy bề mặt từ vai người dùng.
   */
  queryKeys.trips.all,
  queryKeys.bookings.all,
  /** Yêu cầu thuê chờ duyệt — vừa là hộp thư, vừa là con số trên menu điều hướng. */
  queryKeys.bookingRequests.all,
  /**
   * Lịch bận: một chuyến bị huỷ là một ô vừa được trả lại. Màn lịch không mở thì dòng này không
   * tốn gì; mở thì đó đúng là màn không được phép còn hiện một ô đã hết hiệu lực.
   */
  queryKeys.calendar.all,
];

/**
 * Làm mới mọi thứ một thông báo có thể vừa đụng tới.
 *
 * Gọi ở MỘT chỗ (`BadgeRealtimeProvider`) thay vì trong từng hook danh sách: mọi nhánh ở đây
 * đều phản ứng với cùng một tín hiệu `notificationsUnread`, nên rải ra là N bản sao của cùng
 * một quyết định, và nhánh nào bị quên thì chỉ lộ ra ở đúng màn đó.
 */
export function refreshNotificationAffected(queryClient: QueryClient): void {
  for (const queryKey of NOTIFICATION_AFFECTED) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
