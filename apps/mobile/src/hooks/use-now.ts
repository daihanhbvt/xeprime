import { useFocusEffect } from 'expo-router';
import { useCallback, useState, useSyncExternalStore } from 'react';

const TICK_MS = 1000;

type Listener = () => void;

const listeners = new Set<Listener>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function notify(): void {
  now = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (timer === null) {
    // Người đăng ký đầu tiên sau một quãng im lặng phải thấy giờ HIỆN TẠI, không phải nhịp cuối.
    notify();
    timer = setInterval(notify, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const subscribeFrozen = (): (() => void) => () => {};
const readNow = (): number => now;

/**
 * Đồng hồ dùng CHUNG cho mọi bộ đếm ngược trên màn — MỘT `setInterval` cho cả danh sách, không
 * phải mỗi thẻ một cái.
 *
 * Trước đây mỗi `RespondDeadline` tự đặt timer 1 giây: hộp thư có 10 yêu cầu đang chờ là 10 timer
 * và 10 lần render mỗi giây, và chúng vẫn chạy khi người dùng đã sang tab khác vì Tabs giữ màn
 * cũ sống. Ở đây timer chỉ tồn tại khi còn ít nhất một người đăng ký, và một thẻ chỉ đăng ký khi
 * màn chứa nó ĐANG focus (`useFocusEffect`) — rời tab là cả danh sách ngừng tick, quay lại là
 * đọc giờ mới ngay.
 *
 * `enabled = false` (đã hết hạn) trả về nhịp cuối và không đăng ký gì.
 */
export function useNow(enabled = true): number {
  const [focused, setFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return useSyncExternalStore(enabled && focused ? subscribe : subscribeFrozen, readNow, readNow);
}
