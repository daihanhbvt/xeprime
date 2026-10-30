/**
 * Ý ĐỊNH thích/bỏ thích đang chờ khách đăng nhập (BRD §5.1.7) — bản native của web
 * `favorite-intent.ts`.
 *
 * Khách chưa đăng nhập (hoặc phiên vừa hết hạn) bấm trái tim ⇒ ghi ý định ở đây rồi mở màn đăng
 * nhập; đăng nhập xong `FavoriteIntentResumer` TỰ HOÀN TẤT lượt lưu (idempotent, vô hại — không tạo
 * yêu cầu, không chạm tiền; khác bản nháp đặt xe của ADR 0060 vốn không bao giờ tự gửi).
 *
 * Web giữ ở `sessionStorage` (sống trong một tab, mất khi đóng). Tương đương trên app là BỘ NHỚ
 * của tiến trình: sống qua màn đăng nhập (kể cả vòng Google/Facebook — app chỉ chuyển nền), mất khi
 * tắt app. Không ghi ra đĩa: chỉ là `vehicleId` + trạng thái mong muốn, và một ý định còn sống qua
 * lần mở app sau sẽ lưu xe hộ một người có khi đã quên mình định lưu xe nào.
 */

/** Quá hạn là bỏ — cùng con số với web. */
export const FAVORITE_INTENT_TTL_MS = 30 * 60 * 1000;

export interface FavoriteIntent {
  vehicleId: string;
  favorite: boolean;
  savedAt: number;
}

let current: FavoriteIntent | null = null;

const listeners = new Set<() => void>();
function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeFavoriteIntent(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Snapshot cho `useSyncExternalStore` — cùng một object tới khi ghi/xoá, nên so `===` ổn định. */
export function favoriteIntentSnapshot(): FavoriteIntent | null {
  return current;
}

/** Ý định còn hiệu lực ở thời điểm `now` — quá {@link FAVORITE_INTENT_TTL_MS} thì coi như không có. */
export function liveFavoriteIntent(
  intent: FavoriteIntent | null,
  now: number = Date.now(),
): FavoriteIntent | null {
  if (!intent || now - intent.savedAt > FAVORITE_INTENT_TTL_MS) return null;
  return intent;
}

/** Ghi đè ý định cũ — một ý định cho một lần mời đăng nhập. Trả mốc ghi (ms). */
export function saveFavoriteIntent(vehicleId: string, favorite: boolean): number {
  const savedAt = Date.now();
  current = { vehicleId, favorite, savedAt };
  notify();
  return savedAt;
}

export function clearFavoriteIntent(): void {
  if (!current) return;
  current = null;
  notify();
}
