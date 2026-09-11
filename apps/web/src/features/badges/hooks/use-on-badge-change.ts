'use client';

import { useEffect, useRef } from 'react';

/**
 * Chạy `onChange` khi một con số huy hiệu ĐỔI — cầu nối giữa bản chiếu realtime và những query
 * hiển thị chi tiết của chính con số đó.
 *
 * Vì sao cần: bản chiếu `user_badges/{uid}` chỉ mang CON SỐ. Danh sách đứng sau nó — hộp thư,
 * danh sách thông báo, số yêu cầu chờ duyệt — là những query riêng với nhịp làm mới riêng. Không
 * nối hai thứ lại thì con số nhảy tức thì còn danh sách đứng im tới nhịp poll kế tiếp, và người
 * dùng thấy đúng thứ khó chịu nhất: chuông báo có việc mới, mở ra không có gì.
 *
 * Ba luật, và cả ba đều để KHÔNG gọi API khi không ai được lợi:
 *
 *  1. **Bỏ qua lần chạy đầu.** Lúc mount, query đứng sau đã tự tải rồi — gọi thêm một lượt nữa là
 *     tự sinh một request thừa ở mọi trang.
 *  2. **Tab bị ẩn thì hoãn.** `refetchInterval` của TanStack tự nghỉ khi tab mất focus, nhưng
 *     `invalidateQueries` thì không: listener Firestore vẫn sống trong tab nền, nên mỗi sự kiện
 *     sẽ kéo theo một lượt tải cho một màn hình không ai nhìn. Thay vì gọi ngay, ghi nhận "còn nợ
 *     một lượt" và trả nợ đúng lúc người dùng quay lại.
 *  3. **Chỉ CON SỐ mới kích hoạt**, không phải danh tính của `onChange` — nên nơi gọi không cần
 *     `useCallback`.
 *
 * Việc hoãn không làm chậm cái gì người dùng thấy: lúc quay lại tab, hook chạy `onChange` ngay
 * trước cả khi `refetchOnWindowFocus` kịp làm gì.
 */
export function useOnBadgeChange(value: number, onChange: () => void): void {
  const handler = useRef(onChange);
  useEffect(() => {
    handler.current = onChange;
  });

  const previous = useRef<number | null>(null);
  /** Có thay đổi xảy ra trong lúc tab bị ẩn — phải chạy bù khi quay lại. */
  const pending = useRef(false);

  useEffect(() => {
    if (previous.current !== null && previous.current !== value) {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        pending.current = true;
      } else {
        handler.current();
      }
    }
    previous.current = value;
  }, [value]);

  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible' || !pending.current) return;
      pending.current = false;
      handler.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}
