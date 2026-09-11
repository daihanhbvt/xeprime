/**
 * Huy hiệu của người đang đăng nhập — những con số "có gì đang đợi tôi" hiện trên chuông và
 * biểu tượng chat ở MỌI trang.
 *
 * Vì sao có kiểu dùng chung thay vì để mỗi nơi tự khai: cùng một bộ số này đi qua HAI đường
 * hoàn toàn khác nhau — `GET /me/badges` (REST, lưới an toàn) và document `user_badges/{uid}`
 * trên Firestore (realtime, đường chính). Hai đường phải mang đúng một hình dạng, nếu không thì
 * badge sẽ nhảy giá trị mỗi lần đổi nguồn, và không ai tìm ra vì sao.
 *
 * KHÔNG nằm ở đây: số yêu cầu đặt xe chờ duyệt. Nó bị THU HẸP theo chi nhánh đang chọn — một
 * lựa chọn chỉ tồn tại ở client (Redux `scope.branchId`) — nên một con số toàn tài khoản sẽ nói
 * khác danh sách mà người dùng mở ra. Nó giữ query riêng, đúng scope của màn hình nó dẫn tới.
 */
export interface UserBadgeCounts {
  /** Tin chưa đọc ở hộp thư KHÁCH của tôi. */
  chatCustomer: number;
  /**
   * Tin chưa đọc ở hộp thư GIAN HÀNG của tôi, gộp mọi gian hàng tôi đang là thành viên active.
   *
   * Đây là con số DÙNG CHUNG của gian hàng (`conversations.unread_tenant_count`): một nhân viên
   * đọc là cả đội hết chưa đọc. Đúng như vậy — đó là hộp thư công việc, không phải hộp thư
   * riêng của từng người.
   */
  chatShop: number;
  /** Thông báo in-app chưa đọc (chuông). */
  notificationsUnread: number;
}

/**
 * Collection Firestore chứa bản chiếu huy hiệu — mỗi người dùng đúng MỘT document, id = user id.
 *
 * Hằng số dùng chung cho worker (bên ghi) và web (bên nghe). Firestore Security Rules khoá quyền
 * đọc theo `request.auth.uid == uid`, và writer duy nhất vẫn là worker qua Admin SDK (ADR 0009):
 * client không bao giờ ghi vào đây.
 */
export const USER_BADGES_COLLECTION = 'user_badges';

/** Document `user_badges/{uid}`: bộ đếm + mốc chiếu để client bỏ qua snapshot đến trễ. */
export interface UserBadgeDoc extends UserBadgeCounts {
  /**
   * `Date.now()` của WORKER lúc chiếu.
   *
   * So được với `asOf` của `GET /me/badges` vì cả hai đều là đồng hồ của máy chủ (API và worker
   * chạy cùng một host mỗi môi trường — `docs/deployment.md` §1). Đó là điều làm cho câu "bản
   * chiếu này cũ hơn lượt đọc REST kia" trở thành một phép so sánh ĐÚNG, chứ không phải một
   * phỏng đoán dựa trên đồng hồ của trình duyệt.
   */
  updatedAt: number;
}
