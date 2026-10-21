/**
 * Ý ĐỊNH thích/bỏ thích đang chờ khách đăng nhập (BRD §5.1.7).
 *
 * Khách chưa đăng nhập (hoặc phiên vừa hết hạn) bấm trái tim ⇒ ghi ý định ở đây rồi mời đăng nhập.
 * Đăng nhập bằng mật khẩu diễn ra ngay trên trang; Google/Facebook RỜI TRANG rồi quay về đúng trang
 * cũ (ADR 0019) — cùng một tab, nên `sessionStorage` sống qua vòng đó.
 *
 * KHÁC bản nháp đặt xe của ADR 0060 (không bao giờ tự gửi): ở đây sau khi đăng nhập xong hệ thống
 * TỰ HOÀN TẤT lượt lưu, vì BRD yêu cầu vậy và vì thao tác này idempotent, vô hại — không tạo yêu
 * cầu, không chạm tiền, không giữ lịch, bỏ được bằng một lần bấm. Chỉ mang `vehicleId` + trạng thái
 * mong muốn, không có dữ liệu cá nhân nào. Không dùng URL (lọt vào lịch sử/link chia sẻ) hay
 * `localStorage` (sống qua cả lúc đóng trình duyệt cho người dùng sau trên cùng máy).
 */

const STORAGE_KEY = 'xp.favoriteIntent.v1';

/** Quá hạn là bỏ — khách có thể đã quên mình định lưu xe nào. */
export const FAVORITE_INTENT_TTL_MS = 30 * 60 * 1000;

export interface FavoriteIntent {
  vehicleId: string;
  favorite: boolean;
  savedAt: number;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeFavoriteIntent(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Chuỗi thô làm snapshot cho `useSyncExternalStore` (so sánh bằng `===` nên phải ổn định). */
export function favoriteIntentSnapshot(): string | null {
  try {
    return storage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function serverFavoriteIntentSnapshot(): string | null {
  return null;
}

export function parseFavoriteIntent(
  raw: string | null,
  now: number = Date.now(),
): FavoriteIntent | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FavoriteIntent> | null;
    if (
      !parsed ||
      typeof parsed.vehicleId !== 'string' ||
      !parsed.vehicleId ||
      typeof parsed.favorite !== 'boolean' ||
      typeof parsed.savedAt !== 'number' ||
      now - parsed.savedAt > FAVORITE_INTENT_TTL_MS
    ) {
      return null;
    }
    return { vehicleId: parsed.vehicleId, favorite: parsed.favorite, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

/** Ghi đè ý định cũ — một ý định cho một lần mời đăng nhập. Trả mốc ghi (ms). */
export function saveFavoriteIntent(vehicleId: string, favorite: boolean): number {
  const savedAt = Date.now();
  const store = storage();
  if (!store) return savedAt;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ vehicleId, favorite, savedAt }));
  } catch {
    return savedAt;
  }
  notify();
  return savedAt;
}

export function clearFavoriteIntent(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
  notify();
}
