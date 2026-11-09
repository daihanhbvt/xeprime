'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type ViewMode = 'grid' | 'list';
/** Khoá nhớ chế độ xem kết quả trên thiết bị — cùng tên với app native. */
const VIEW_MODE_KEY = 'xp:marketplace-view-mode';

/** Nguồn chế độ hiển thị cho `useSyncExternalStore`: localStorage, dự phòng bộ nhớ khi bị chặn. */
const listeners = new Set<() => void>();
let fallback: ViewMode = 'grid';

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(): ViewMode {
  try {
    const saved = window.localStorage.getItem(VIEW_MODE_KEY);
    if (saved === 'grid' || saved === 'list') return saved;
  } catch {
    // Chế độ riêng tư / chặn lưu trữ: dùng bản trong bộ nhớ.
  }
  return fallback;
}

/**
 * Chế độ hiển thị kết quả: 'grid' (mặc định) hoặc 'list' (thẻ ngang). NHỚ trên thiết bị — tiện ích
 * cá nhân, không phải dữ liệu (người dùng chốt 27/10/2026). Một kho chung cho danh sách kết quả
 * và nút chuyển ở hàng viên lọc (hero + thanh cố định), nên bấm ở đâu cũng đổi cùng lúc. Đọc SAU
 * khi mount: đọc lúc render là lệch HTML giữa server và client.
 */
export function useViewMode(): [ViewMode, (next: ViewMode) => void] {
  const viewMode = useSyncExternalStore(subscribe, read, () => 'grid' as ViewMode);
  const setViewMode = useCallback((next: ViewMode) => {
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      // Không lưu được thì chỉ mất phần "nhớ", nút vẫn đổi chế độ.
    }
    fallback = next;
    listeners.forEach((listener) => listener());
  }, []);
  return [viewMode, setViewMode];
}
