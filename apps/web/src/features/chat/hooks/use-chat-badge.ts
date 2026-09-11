'use client';

import { CHAT_SIDE, type ChatSide } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { useBadges } from '@/features/badges/hooks/use-badges';

export interface ChatBadge {
  /** Con số hiện trên biểu tượng — tổng CẢ HAI vai. */
  count: number;
  /** Hộp thư nên mở khi bấm vào biểu tượng. */
  href: string;
}

/**
 * Biểu tượng chat trên thanh trên cùng — con số và đích đến.
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

  const here = surface === CHAT_SIDE.CUSTOMER ? chatCustomer : chatShop;
  const there = surface === CHAT_SIDE.CUSTOMER ? chatShop : chatCustomer;

  const stay = surface === CHAT_SIDE.CUSTOMER ? ROUTES.CHAT : ROUTES.MANAGE.CHAT;
  const away = surface === CHAT_SIDE.CUSTOMER ? ROUTES.MANAGE.CHAT : ROUTES.CHAT;

  return {
    count: chatCustomer + chatShop,
    href: here === 0 && there > 0 ? away : stay,
  };
}
