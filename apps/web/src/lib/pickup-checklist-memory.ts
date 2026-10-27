/**
 * Các mục "Checklist nhận xe" khách đã tự đánh dấu — CHỈ trong trình duyệt này, theo từng chuyến.
 *
 * Đây là ghi nhớ cá nhân, không phải biên bản: không gửi lên server, không ai khác thấy, mất khi xoá
 * dữ liệu trang. Biên bản bàn giao vẫn là nơi duy nhất chốt hiện trạng xe.
 *
 * `localStorage` có thể không tồn tại (SSR) hoặc NÉM (chế độ riêng tư, chặn dữ liệu trang) — mọi lời
 * gọi bọc try/catch và lỗi chỉ có nghĩa là "chưa đánh dấu gì".
 *
 * ## Đọc qua `useSyncExternalStore`
 *
 * Nơi gọi đọc bằng {@link subscribePickupChecklist} + {@link pickupChecklistSnapshot} (ảnh chụp
 * server là `''`), không setState trong effect: HTML server dựng là bản "chưa đánh dấu gì", React
 * đọc kho thật ngay sau hydration, và dấu tick ở tab khác cũng về theo. Cùng hình thái với
 * `province-memory.ts`.
 */
const KEY_PREFIX = 'xp.pickupChecklist.';

/**
 * Dấu tick KHÔNG ghi được vào `localStorage` (bị chặn, hết quota) — giữ trong bộ nhớ tab để vẫn
 * đúng cho lượt xem hiện tại; mất khi tải lại trang.
 */
const unsavedFallback = new Map<string, string>();

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Nội dung THÔ đã lưu cho một chuyến (`''` = chưa có gì) — ảnh chụp cho `useSyncExternalStore`.
 * Trả chuỗi chứ không trả mảng: React so ảnh chụp bằng tham chiếu, và một mảng parse mới mỗi lần
 * hỏi sẽ khiến nó render lại không dừng.
 */
export function pickupChecklistSnapshot(tripId: string): string {
  const unsaved = unsavedFallback.get(tripId);
  if (unsaved !== undefined) return unsaved;
  try {
    return storage()?.getItem(KEY_PREFIX + tripId) ?? '';
  } catch {
    return '';
  }
}

/** Ảnh chụp thô → danh sách mục đã đánh dấu. Dữ liệu hỏng ⇒ coi như chưa đánh dấu gì. */
export function parsePickupChecklist(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Lượt ghi trong CÙNG tab không phát sự kiện `storage` — tự báo cho các component đang đọc. Tab
 * KHÁC ghi thì `storage` bắn.
 */
const listeners = new Set<() => void>();

export function subscribePickupChecklist(onChange: () => void): () => void {
  listeners.add(onChange);
  if (typeof window !== 'undefined') window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onChange);
  };
}

export function writePickupChecklist(tripId: string, checked: readonly string[]): void {
  const raw = checked.length === 0 ? '' : JSON.stringify(checked);
  try {
    const store = storage();
    if (!store) throw new Error('no storage');
    if (raw) store.setItem(KEY_PREFIX + tripId, raw);
    else store.removeItem(KEY_PREFIX + tripId);
    unsavedFallback.delete(tripId);
  } catch {
    // Không lưu được thì giữ trong bộ nhớ tab — dấu tick vẫn đúng cho lượt xem hiện tại.
    unsavedFallback.set(tripId, raw);
  }
  for (const notify of listeners) notify();
}
