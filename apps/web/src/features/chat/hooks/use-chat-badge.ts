'use client';

import { CHAT_SIDE, type ChatInbox, type ChatSide } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { resolveChatInbox } from '../chat-inbox';

export interface ChatBadge {
  /** Con số hiện trên biểu tượng — tin chưa đọc của hộp thư thuộc bề mặt này. */
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
 * Từ ADR 0053 mỗi site là một tài khoản riêng: tài khoản khách chỉ có hội thoại khách, tài khoản
 * đối tác chỉ có hội thoại gian hàng. Biểu tượng đếm và mở ĐÚNG hộp thư của bề mặt — bản trước đếm
 * tổng hai vai và "nhảy sang bề mặt kia" khi bên này hết tin, nhưng bề mặt kia giờ là một SITE khác
 * với một phiên khác, nơi tài khoản này không đăng nhập.
 *
 * Không cần cờ bật/tắt: `useBadges` tự im lặng khi chưa đăng nhập, nên khu công khai không gọi
 * API gây 401.
 */
export function useChatBadge(surface: ChatSide): ChatBadge {
  const { chatCustomer, chatShop } = useBadges();
  const inbox = resolveChatInbox(surface);
  const isCustomer = surface === CHAT_SIDE.CUSTOMER;
  return {
    count: isCustomer ? chatCustomer : chatShop,
    href: isCustomer ? ROUTES.CHAT : ROUTES.MANAGE.CHAT,
    inbox,
  };
}
