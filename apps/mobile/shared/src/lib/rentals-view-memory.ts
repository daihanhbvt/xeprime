import { getSecureItem, SECURE_KEY, setSecureItem } from '@/lib/secure-storage';

/**
 * Dạng xem màn "Đơn thuê xe" người dùng chọn GẦN NHẤT — bản native của
 * `apps/web/src/lib/rentals-view-memory.ts` (sổ cái §3.2c dòng 7): chưa chọn bao giờ ⇒ Kanban;
 * điện thoại luôn List (không có nút), nên chỉ màn rộng đọc/ghi khoá này.
 */
export const RENTAL_VIEW = { BOARD: 'board', LIST: 'list' } as const;
export type RentalView = (typeof RENTAL_VIEW)[keyof typeof RENTAL_VIEW];

export async function readRememberedRentalsView(): Promise<RentalView | null> {
  const raw = await getSecureItem(SECURE_KEY.RENTALS_VIEW);
  return raw === RENTAL_VIEW.BOARD || raw === RENTAL_VIEW.LIST ? raw : null;
}

/** Ghi lựa chọn CHỦ ĐỘNG; ghi hỏng chỉ mất tiện ích. */
export function rememberRentalsView(view: RentalView): void {
  void setSecureItem(SECURE_KEY.RENTALS_VIEW, view).catch(() => {});
}
