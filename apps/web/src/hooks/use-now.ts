'use client';

import { useEffect, useState } from 'react';

const MINUTE_MS = 60_000;

/**
 * "Bây giờ" nhích theo nhịp — để một component so hạn với đồng hồ máy mà không gọi `Date.now()`
 * trong lúc render (hàm không thuần: React Compiler bỏ memo, và hai lần render cho hai kết quả).
 * Nhịp mặc định một phút: đủ cho nhãn "còn 3 giờ" đổi kịp mà không bắt cả bảng render từng giây.
 */
export function useNow(intervalMs: number = MINUTE_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
