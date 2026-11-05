import { isRentalView, type RentalView } from '@/constants/rental-stages';

/**
 * Cách xem (Kanban / List) người dùng TỰ CHỌN gần nhất trên màn "Đơn thuê xe" — tiện ích riêng của
 * từng trình duyệt (sổ cái §3.2b, 05/11/2026). URL `?view=` luôn thắng; nhớ ở đây chỉ trả lời câu
 * "mở màn mà link không nói dạng xem thì hiện gì".
 *
 * `localStorage` không tồn tại trên server và có thể NÉM (chế độ riêng tư, chặn dữ liệu trang) — mọi
 * lời gọi bọc `try`, và nơi đọc đi qua `useSyncExternalStore` với snapshot server riêng, không đọc
 * lúc render lần đầu. Ghi hỏng thì màn vẫn chạy, chỉ không nhớ.
 */

const STORAGE_KEY = 'xp.rentals.view';

/** Báo cho các hook đang nghe trong CÙNG tab — sự kiện `storage` chỉ bắn ở tab khác. */
const listeners = new Set<() => void>();

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRememberedRentalsView(): RentalView | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY) ?? null;
    return isRentalView(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Chỉ gọi từ thao tác chủ động (bấm nút chuyển dạng xem) — không bao giờ từ một giá trị máy tự điền. */
export function rememberRentalsView(view: RentalView): void {
  try {
    storage()?.setItem(STORAGE_KEY, view);
  } catch {
    // Hết quota / bị chặn — bỏ qua, lựa chọn vẫn nằm trên URL của lần xem này.
  }
  for (const listener of listeners) listener();
}

export function subscribeRentalsView(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}
