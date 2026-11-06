'use client';

import { useSyncExternalStore } from 'react';
import { RENTAL_VIEW, type RentalView } from '@/constants/rental-stages';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useIsMobile } from '@/hooks/use-media-query';
import { readRememberedRentalsView, subscribeRentalsView } from '@/lib/rentals-view-memory';

/** Snapshot server: chưa đọc được bộ nhớ trình duyệt — chưa biết dạng xem. */
const PENDING = 'pending';

/**
 * Dạng xem đang hiện của màn "Đơn thuê xe" (sổ cái §3.2b, 05/11/2026):
 *
 * 1. Điện thoại (≤ mốc mobile) LUÔN là List — bốn cột Kanban không vừa, và kéo thả tranh với cuộn.
 * 2. `?view=` trên URL thắng — link chia sẻ / bấm nút chuyển.
 * 3. Lựa chọn gần nhất của trình duyệt này.
 * 4. Chưa chọn bao giờ ⇒ Kanban (frame chính của design) — trừ chủ xe tuyến hoa hồng: List
 *    (06/11/2026). Một tới ba chiếc xe thì bốn cột Kanban phần lớn trống; nút chuyển vẫn còn.
 *
 * `view = null` trong lượt hydrate đầu (server không đọc được `localStorage`): nơi gọi hiện trạng
 * thái tải thay vì vẽ Kanban rồi giật sang List.
 */
export function useRentalsView(urlView: RentalView | undefined): {
  view: RentalView | null;
  /** Có nút chuyển sang Kanban không — điện thoại thì không. */
  boardAvailable: boolean;
} {
  const isMobile = useIsMobile();
  const { data: user } = useCurrentUser();
  const remembered = useSyncExternalStore<RentalView | null | typeof PENDING>(
    subscribeRentalsView,
    readRememberedRentalsView,
    () => PENDING,
  );
  if (remembered === PENDING) return { view: null, boardAvailable: false };
  if (isMobile) return { view: RENTAL_VIEW.LIST, boardAvailable: false };
  const fallback =
    resolvePartnerTrack(user) === PARTNER_TRACK.COMMISSION ? RENTAL_VIEW.LIST : RENTAL_VIEW.BOARD;
  return { view: urlView ?? remembered ?? fallback, boardAvailable: true };
}
