'use client';

import { CHAT_INBOX, CHAT_SIDE, type ChatInbox, type ChatSide } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { useCurrentUser } from '@/hooks/use-current-user';
import { resolveChatInbox } from '../chat-inbox';

export interface ChatBadge {
  /** Con số hiện trên biểu tượng — tổng CẢ HAI vai. */
  count: number;
  /** Hộp thư nên mở khi bấm vào biểu tượng. */
  href: string;
  /**
   * Hộp thư mà `href` trỏ tới. Popup xem nhanh phải liệt kê ĐÚNG hộp thư mà biểu tượng sẽ mở —
   * nếu không thì con số, danh sách và màn hình mở ra nói ba điều khác nhau.
   */
  inbox: ChatInbox;
}

/**
 * Biểu tượng chat trên thanh trên cùng — con số, đích đến và hộp thư tương ứng.
 *
 * Bài toán nó giải: một chủ gian hàng đang lướt chợ xe KHÔNG hề biết khách vừa nhắn vào shop,
 * vì badge ở khu khách chỉ đếm hộp thư khách. Người dùng chỉ có một khái niệm "tin nhắn chưa
 * đọc"; việc nó nằm ở vai nào là chuyện nội bộ của hệ thống.
 *
 * Nên badge đếm TỔNG, còn đích đến thì chọn theo nơi thật sự có tin: ưu tiên hộp thư của bề mặt
 * đang đứng, và chỉ nhảy sang bề mặt kia khi bên này không còn gì. Không có bước này thì con số
 * và màn hình mở ra sẽ nói hai điều khác nhau — badge báo 3, mở ra trống trơn.
 *
 * Không cần cờ bật/tắt: `useBadges` tự im lặng khi chưa đăng nhập, nên khu công khai không gọi
 * API gây 401.
 */
export function useChatBadge(surface: ChatSide): ChatBadge {
  const { chatCustomer, chatShop } = useBadges();
  const { data: user } = useCurrentUser();
  const inbox = resolveChatInbox(surface, user);

  /*
   * HỘP THƯ HỢP NHẤT — biểu tượng luôn mở `/chat`, và `/chat` đã chứa cả hai vế.
   *
   * Phép "nhảy sang bề mặt kia" ngay dưới sinh ra để con số và màn hình mở ra không nói hai điều
   * khác nhau. Với người có hộp thư hợp nhất thì không còn bề mặt nào để nhảy sang — và một trong
   * hai đích cũ (`/manage/chat`) là cánh cửa đóng với chính họ.
   */
  if (inbox === CHAT_INBOX.UNIFIED) {
    return { count: chatCustomer + chatShop, href: ROUTES.CHAT, inbox };
  }

  const here = surface === CHAT_SIDE.CUSTOMER ? chatCustomer : chatShop;
  const there = surface === CHAT_SIDE.CUSTOMER ? chatShop : chatCustomer;
  const elsewhere = here === 0 && there > 0;

  const stay = surface === CHAT_SIDE.CUSTOMER ? ROUTES.CHAT : ROUTES.MANAGE.CHAT;
  const away = surface === CHAT_SIDE.CUSTOMER ? ROUTES.MANAGE.CHAT : ROUTES.CHAT;
  const other = surface === CHAT_SIDE.CUSTOMER ? CHAT_SIDE.SHOP : CHAT_SIDE.CUSTOMER;

  return {
    count: chatCustomer + chatShop,
    href: elsewhere ? away : stay,
    inbox: elsewhere ? other : surface,
  };
}
