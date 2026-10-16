import { useEffect, useState } from 'react';
import { getFreshAccessToken } from './auth-session';

/**
 * Header `Authorization` cho một tấm ảnh tải từ endpoint CẦN phiên (ảnh bản đồ chi nhánh —
 * `/branches/:id/map`). Web dùng cookie của site; native không có cookie nên phải gửi Bearer qua
 * `source.headers` của `expo-image`.
 *
 * `undefined` = còn đang lấy token (nơi gọi chưa dựng ảnh, tránh một lượt 401 vô ích); `null` =
 * không có phiên. Token chỉ nằm trong bộ nhớ, không log, không vào URL (ADR 0017).
 */
export function useAuthImageHeaders(enabled = true): Record<string, string> | null | undefined {
  const [headers, setHeaders] = useState<Record<string, string> | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void getFreshAccessToken()
      .then((token) => {
        if (alive) setHeaders(token ? { Authorization: `Bearer ${token}` } : null);
      })
      .catch(() => {
        if (alive) setHeaders(null);
      });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return headers;
}
