import { useEffect, useState } from 'react';

/** Bàn phím ảo bắn ra mỗi ký tự một lần render — gọi API theo từng ký tự là tự tạo rate limit. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
