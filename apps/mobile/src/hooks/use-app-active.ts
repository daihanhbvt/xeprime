import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

type Listener = () => void;

const listeners = new Set<Listener>();
let active = AppState.currentState === 'active';
let subscription: { remove: () => void } | null = null;

function handleChange(next: AppStateStatus): void {
  const nextActive = next === 'active';
  if (nextActive === active) return;
  active = nextActive;
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (!subscription) {
    // Người đăng ký đầu tiên phải thấy trạng thái HIỆN TẠI, không phải trạng thái lúc nạp module.
    active = AppState.currentState === 'active';
    subscription = AppState.addEventListener('change', handleChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && subscription) {
      subscription.remove();
      subscription = null;
    }
  };
}

const read = (): boolean => active;

/**
 * App có đang ở TIỀN CẢNH không — một đăng ký `AppState` dùng chung cho cả cây.
 *
 * Mỗi hook tự gọi `AppState.addEventListener` thì màn chat mở ra đã có bốn đăng ký cho cùng một
 * sự kiện, và mỗi cái là một lần render. Cùng khuôn với `useNow`: một nguồn ngoài React, đăng ký
 * chỉ tồn tại khi còn người nghe.
 *
 * Dùng để TẮT nhịp poll khi máy nằm trong túi: một `setInterval` chạy nền là pin và dữ liệu di
 * động tiêu cho một màn không ai nhìn.
 */
export function useAppActive(): boolean {
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * Gọi `onForeground` mỗi lần app từ nền quay lại tiền cảnh — KHÔNG gọi ở lần dựng đầu.
 *
 * Lần đầu đã có sẵn một lượt tải của chính query, nên gọi thêm ở đây là nhân đôi request ngay
 * khi mở màn. Chỉ CHUYỂN TIẾP nền → tiền cảnh mới đáng, vì đó là quãng dữ liệu chắc chắn đã cũ:
 * đợi hết một nhịp poll sau khi mở lại app là vài giây im lặng nhìn thấy được.
 */
export function useRefetchOnForeground(onForeground: () => void): void {
  const activeNow = useAppActive();
  const wasActive = useRef(activeNow);

  useEffect(() => {
    if (activeNow && !wasActive.current) onForeground();
    wasActive.current = activeNow;
  }, [activeNow, onForeground]);
}
