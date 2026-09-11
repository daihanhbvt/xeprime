'use client';

import { CHAT_SIDE, type ChatSide } from '@xeprime/types';
import { useBadges } from '@/features/badges/hooks/use-badges';

/**
 * Tổng tin chưa đọc cho badge icon chat — THEO BỀ MẶT.
 *
 * `side` bắt buộc vì con số này dẫn tới một màn cụ thể: badge trên thanh khu khách phải đếm hộp
 * thư khách, badge sidebar khu quản lý phải đếm inbox gian hàng. Cộng gộp cả hai là bảo chủ shop
 * rằng có 3 tin chưa đọc, họ mở inbox công việc ra và không thấy tin nào.
 *
 * KHÔNG còn request riêng: con số lấy từ `useBadges`, cùng một query mà chuông và biểu tượng chat
 * đã dùng. Trước đây hook này gọi `/conversations/unread-count?side=…` song song với
 * `/conversations/unread-summary` — hai request cho một con số vốn đã nằm sẵn trong response kia.
 */
export function useChatUnreadCount(side: ChatSide): number {
  const badges = useBadges();
  return side === CHAT_SIDE.CUSTOMER ? badges.chatCustomer : badges.chatShop;
}
