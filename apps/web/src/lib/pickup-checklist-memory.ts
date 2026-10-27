/**
 * Các mục "Checklist nhận xe" khách đã tự đánh dấu — CHỈ trong trình duyệt này, theo từng chuyến.
 *
 * Đây là ghi nhớ cá nhân, không phải biên bản: không gửi lên server, không ai khác thấy, mất khi xoá
 * dữ liệu trang. Biên bản bàn giao vẫn là nơi duy nhất chốt hiện trạng xe.
 *
 * `localStorage` có thể không tồn tại (SSR) hoặc NÉM (chế độ riêng tư, chặn dữ liệu trang) — mọi lời
 * gọi bọc try/catch và lỗi chỉ có nghĩa là "chưa đánh dấu gì".
 */
const KEY_PREFIX = 'xp.pickupChecklist.';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readPickupChecklist(tripId: string): string[] {
  try {
    const raw = storage()?.getItem(KEY_PREFIX + tripId);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function writePickupChecklist(tripId: string, checked: readonly string[]): void {
  try {
    const store = storage();
    if (!store) return;
    if (checked.length === 0) store.removeItem(KEY_PREFIX + tripId);
    else store.setItem(KEY_PREFIX + tripId, JSON.stringify(checked));
  } catch {
    // Không lưu được thì thôi — dấu tick vẫn đúng cho lượt xem hiện tại.
  }
}
