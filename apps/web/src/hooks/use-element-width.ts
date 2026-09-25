'use client';

import { useCallback, useLayoutEffect, useRef, useState, type RefCallback } from 'react';

const identity = (width: number): number => width;

/**
 * Theo dõi bề rộng (px) của một phần tử bằng `ResizeObserver`, trả về một giá trị SUY RA từ nó.
 *
 * Dùng khi bố cục phụ thuộc chỗ THẬT còn lại chứ không phải bề rộng viewport — ví dụ bảng đứng
 * cạnh một panel: cùng một màn 1440px, sidebar thu gọn hay mở rộng cho bảng hai bề rộng khác
 * nhau, và media query không biết điều đó.
 *
 * `select` biến bề rộng thành đúng thứ nơi dùng cần (số cột phải ẩn, một bậc bố cục…) và nên trả
 * về giá trị NGUYÊN THUỶ: component chỉ render lại khi kết quả đổi (`Object.is`), không phải mỗi
 * khung hình lúc người dùng kéo cửa sổ hay lúc một transition padding đang chạy. Không truyền
 * `select` thì nhận thẳng bề rộng (đã làm tròn).
 *
 * Trả về callback ref (gắn thẳng vào `ref={...}`) — phần tử được gắn/gỡ muộn (sau Suspense, sau
 * một nhánh điều kiện) vẫn được theo dõi đúng.
 *
 * `null` = chưa đo được (SSR, lần render đầu, hoặc môi trường không có `ResizeObserver` như
 * jsdom). Nơi dùng phải có bố cục mặc định hợp lý cho `null`, không được coi nó là 0.
 */
export function useElementWidth<T extends HTMLElement, R = number>(
  select: (width: number) => R = identity as unknown as (width: number) => R,
): [RefCallback<T>, R | null] {
  const [value, setValue] = useState<R | null>(null);
  // Giữ `select` mới nhất trong ref: đưa nó vào deps của callback ref thì mỗi lần render với một
  // lambda mới, React sẽ gỡ observer cũ rồi gắn observer mới.
  // Cập nhật trong layout effect (không phải lúc render): chạy trước mọi callback của observer ở
  // khung hình kế tiếp, nên observer luôn dùng `select` mới nhất.
  const selectRef = useRef(select);
  useLayoutEffect(() => {
    selectRef.current = select;
  });

  const ref = useCallback<RefCallback<T>>((node) => {
    if (!node || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = selectRef.current(Math.round(entry.contentRect.width));
      // Trả lại đúng `prev` khi không đổi ⇒ React bỏ qua lượt render.
      setValue((prev) => (prev !== null && Object.is(prev, next) ? prev : next));
    });
    observer.observe(node);
    // React 19: callback ref trả về hàm dọn dẹp, gọi khi phần tử bị gỡ hoặc ref đổi.
    return () => observer.disconnect();
  }, []);

  return [ref, value];
}
