import {
  CHAT_INBOX,
  CHAT_SIDE,
  TENANT_ROLE,
  isCommissionTrack,
  type ChatInbox,
  type ChatSide,
} from '@xeprime/types';
import type { CurrentUser } from '@/features/auth/api';

/**
 * HỘP THƯ mà một người mở khi đứng trên một bề mặt — nơi DUY NHẤT quyết định điều đó.
 *
 * ## Vấn đề nó giải
 *
 * Chủ xe tuyến hoa hồng không vào khu quản lý được (ADR 0038 điều 4), nên hộp thư công việc của
 * họ không có chỗ đứng riêng. Trước đợt này, biểu tượng chat NHẢY giữa `/chat` và `/manage/chat`
 * tuỳ xem bên nào đang có tin chưa đọc — cùng một cái bấm dẫn tới hai nơi khác nhau vào hai thời
 * điểm khác nhau, và một trong hai nơi đó họ không được vào.
 *
 * Với họ, "tin nhắn" là MỘT khái niệm: khách hỏi xe của họ và chủ xe mà họ đang thuê nằm trong
 * cùng một dòng thời gian. Nên họ nhận hộp thư HỢP NHẤT — hợp ở SERVER, trong một truy vấn, không
 * phải hai danh sách ghép ở client (ADR 0038 ràng buộc 7: ghép ở client cho ra những trang dài
 * ngắn khác nhau, một thứ tự thời gian sai ngay ở trang thứ hai, và một tổng không khớp màn hình).
 *
 * ## Vì sao CHỈ chủ, và chỉ ở bề mặt khách
 *
 * `shop_owner` — không phải mọi thành viên. Quản lý/nhân viên/người xem của một gian hàng tuyến
 * hoa hồng hôm nay KHÔNG có hộp thư gian hàng nào trong giao diện, nên cho họ hộp thư hợp nhất là
 * lặng lẽ mở một bề mặt mới bằng một thay đổi điều hướng.
 *
 * Tuyến GÓI không đổi gì: hộp thư khách và hộp thư vận hành là hai màn với hai tập thông tin và
 * hai nhịp làm việc, và họ có khu quản lý để đặt cái thứ hai.
 *
 * Bề mặt `shop` không bao giờ hợp nhất: `/manage/chat` là bàn làm việc của cả gian hàng, nơi
 * nhiều người cùng đọc. Trộn hội thoại RIÊNG của người đang đăng nhập vào đó là lộ việc riêng
 * của họ cho đồng nghiệp.
 *
 * Hàm THUẦN, nhận đúng phần dữ liệu nó cần — test được mà không dựng React. Cùng luật, cùng hàm
 * với `apps/web/src/features/chat/chat-inbox.ts` (ADR 0031: sửa contract chung là sửa CẢ HAI).
 */
export function resolveChatInbox(
  surface: ChatSide,
  user: Pick<CurrentUser, 'tenant'> | null | undefined,
): ChatInbox {
  if (surface !== CHAT_SIDE.CUSTOMER) return CHAT_INBOX.SHOP;

  const tenant = user?.tenant ?? null;
  const isOwner = tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;
  return isOwner && isCommissionTrack(tenant) ? CHAT_INBOX.UNIFIED : CHAT_INBOX.CUSTOMER;
}
