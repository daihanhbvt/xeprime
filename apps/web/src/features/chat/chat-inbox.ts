import { CHAT_INBOX, CHAT_SIDE, TENANT_ROLE, isCommissionTrack, type ChatInbox, type ChatSide } from '@xeprime/types';

import type { CurrentUser } from '@/hooks/use-current-user';

/**
 * HỘP THƯ mà một người mở khi đứng trên một bề mặt — nơi DUY NHẤT quyết định điều đó.
 *
 * ## Vấn đề nó giải
 *
 * Chủ xe tuyến hoa hồng không vào `/manage` được (ADR 0027/0028), nên hộp thư công việc của họ
 * không có chỗ đứng riêng. Trước đợt này, biểu tượng chat trên header NHẢY giữa `/chat` và
 * `/manage/chat` tuỳ xem bên nào đang có tin chưa đọc — nghĩa là cùng một cái bấm dẫn tới hai
 * nơi khác nhau vào hai thời điểm khác nhau, và một trong hai nơi đó họ không được vào.
 *
 * Với họ, "tin nhắn" là MỘT khái niệm: khách hỏi xe của họ và chủ xe mà họ đang thuê nằm trong
 * cùng một dòng thời gian. Nên họ nhận hộp thư HỢP NHẤT — hợp ở SERVER, trong một truy vấn
 * (`chatInboxScope`), không phải hai danh sách ghép ở client.
 *
 * ## Vì sao CHỈ chủ, và chỉ ở bề mặt khách
 *
 * `shop_owner` — không phải mọi thành viên. Nhân viên/quản lý/người xem của một gian hàng tuyến
 * hoa hồng hôm nay KHÔNG có hộp thư gian hàng nào trong giao diện (`/account/messages` gác bằng
 * `OwnerGate`, `/manage` đóng với tuyến này). Cho họ hộp thư hợp nhất sẽ là cách lặng lẽ mở một
 * bề mặt mới bằng một thay đổi điều hướng — đúng thứ không được làm.
 *
 * Tuyến GÓI không đổi gì: hộp thư khách và hộp thư vận hành là hai màn với hai tập thông tin và
 * hai nhịp làm việc, và họ có `/manage/chat` để đặt cái thứ hai.
 *
 * Bề mặt `shop` không bao giờ hợp nhất: `/manage/chat` là bàn làm việc của cả gian hàng, nơi
 * nhiều người cùng đọc. Trộn hội thoại RIÊNG của người đang đăng nhập vào đó là lộ việc riêng
 * của họ cho đồng nghiệp.
 *
 * Hàm THUẦN, nhận đúng phần dữ liệu nó cần — test được mà không dựng React.
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
