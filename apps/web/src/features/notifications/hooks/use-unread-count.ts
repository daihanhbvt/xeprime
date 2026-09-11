'use client';

import { useBadges } from '@/features/badges/hooks/use-badges';

/**
 * Số thông báo chưa đọc cho badge chuông.
 *
 * Không còn query riêng: con số đi chung `useBadges` với hai hộp thư chat — một request cho cả
 * khung ứng dụng, và bản chiếu Firestore cập nhật cả ba cùng lúc.
 */
export function useUnreadCount(): number {
  return useBadges().notificationsUnread;
}
