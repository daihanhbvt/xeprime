'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * "Phần tử này còn thấy được trong viewport không" — bằng `IntersectionObserver`, KHÔNG bằng
 * listener `scroll`.
 *
 * Lý do: thanh tìm kiếm thu gọn chỉ cần biết một bit (hero còn thấy hay đã trôi khỏi màn),
 * mà listener scroll bắn hàng trăm lần mỗi cú vuốt và mỗi lần đều buộc đọc layout
 * (`getBoundingClientRect`) — đúng kiểu jank khi cuộn. Observer bắn 2 lần cho cả hành trình đó.
 *
 * Trả về **callback ref** thay vì object ref: phần tử quan sát nằm trong nhánh render có điều
 * kiện, nên effect phải chạy lại đúng lúc nó gắn/tháo, chứ không phải đúng lúc component mount.
 */
export function useElementVisibility<T extends HTMLElement>(options?: {
  /** Nới/thu vùng tính giao cắt — dùng để trừ đi phần bị header dính che. */
  rootMargin?: string;
}): { ref: (node: T | null) => void; visible: boolean } {
  const [node, setNode] = useState<T | null>(null);
  /*
   * Mặc định `true` = "hero đang thấy" ⇒ sticky ẩn. Mặc định ngược lại sẽ làm thanh sticky
   * loé lên một khung hình ở đầu trang, trước khi observer kịp bắn lần đầu.
   */
  const [visible, setVisible] = useState(true);
  const rootMargin = options?.rootMargin;

  useEffect(() => {
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setVisible(last.isIntersecting);
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, rootMargin]);

  const ref = useCallback((next: T | null) => setNode(next), []);

  return { ref, visible };
}

/**
 * Giữ phần tử trong DOM đủ lâu để chạy hoạt cảnh RỜI, rồi mới tháo.
 *
 * `mounted` = có render hay không; `entered` = đã sang trạng thái "vào" chưa (bật ở khung hình
 * kế để trình duyệt kịp thấy giá trị đầu và nội suy được).
 *
 * Hai lần đổi trạng thái xảy ra NGAY TRONG RENDER (React chạy lại component trước khi commit —
 * pattern "điều chỉnh state khi prop đổi"), không phải trong effect: gắn phần tử ở khung hình
 * sau sẽ thấy nó nhảy vào chứ không trượt vào. Effect chỉ lo hai thứ thật sự bất đồng bộ —
 * khung hình để bật lớp "vào", và đồng hồ chờ hết hoạt cảnh "ra" mới tháo.
 */
export function useEnterExit(
  active: boolean,
  exitMs: number,
): { mounted: boolean; entered: boolean } {
  const [mounted, setMounted] = useState(active);
  const [entered, setEntered] = useState(active);

  if (active && !mounted) setMounted(true);
  if (!active && entered) setEntered(false);

  useEffect(() => {
    if (!active) {
      const timer = setTimeout(() => setMounted(false), exitMs);
      return () => clearTimeout(timer);
    }
    // Hai khung hình: khung 1 gắn phần tử ở trạng thái đầu, khung 2 mới đổi sang trạng thái vào.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [active, exitMs]);

  return { mounted, entered };
}
