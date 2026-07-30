'use client';

import { useEffect, useState } from 'react';

/**
 * Giá trị trễ `delayMs` sau lần đổi cuối — dùng cho input/draft đổi liên tục (kéo slider,
 * bấm chip) mà consumer (query facets) không nên chạy theo từng nhịp.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
