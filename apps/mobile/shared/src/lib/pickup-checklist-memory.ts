import { useCallback, useEffect, useState } from 'react';
import { getSecureItem, SECURE_KEY, setSecureItem } from '@/lib/secure-storage';

/**
 * Các mục "Checklist nhận xe" khách tự đánh dấu — CHỈ trên máy này, theo từng chuyến.
 *
 * Bản native của `apps/web/src/lib/pickup-checklist-memory.ts` — cùng luật, khác kho: ghi nhớ cá
 * nhân, không gửi server, biên bản bàn giao vẫn là nơi duy nhất chốt hiện trạng xe. Kho chỉ có
 * khoá cố định nên mọi chuyến nằm chung MỘT bản đồ, giữ tối đa {@link MAX_TRIPS} chuyến gần nhất.
 */
const MAX_TRIPS = 30;

type Store = Record<string, string[]>;

async function readStore(): Promise<Store> {
  try {
    const raw = await getSecureItem(SECURE_KEY.PICKUP_CHECKLIST);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

async function writeTrip(tripId: string, keys: string[]): Promise<void> {
  const store = await readStore();
  delete store[tripId];
  if (keys.length > 0) store[tripId] = keys;
  // Thứ tự chèn của object = thứ tự dùng ⇒ cắt từ đầu là bỏ chuyến cũ nhất.
  const trimmed = Object.fromEntries(Object.entries(store).slice(-MAX_TRIPS));
  try {
    await setSecureItem(SECURE_KEY.PICKUP_CHECKLIST, JSON.stringify(trimmed));
  } catch {
    // Không ghi được ⇒ dấu tick vẫn đúng trong lượt xem hiện tại (state), mất khi mở lại.
  }
}

/** Danh sách mục đã đánh dấu của một chuyến + hàm bật/tắt một mục. */
export function usePickupChecklist(tripId: string): {
  checked: string[];
  toggle: (key: string) => void;
} {
  const [checked, setChecked] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void readStore().then((store) => {
      const keys = store[tripId];
      if (alive) setChecked(Array.isArray(keys) ? keys.filter((k) => typeof k === 'string') : []);
    });
    return () => {
      alive = false;
    };
  }, [tripId]);
  const toggle = useCallback(
    (key: string) => {
      setChecked((prev) => {
        const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
        void writeTrip(tripId, next);
        return next;
      });
    },
    [tripId],
  );
  return { checked, toggle };
}
