'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Phần còn khuất bên phải nhỏ hơn mức này coi như đã tới cuối (làm tròn subpixel). */
const END_TOLERANCE_PX = 4;
/** Một lần bấm gợi ý cuộn ~70% bề rộng khung - vẫn để lại một viên cũ làm mốc. */
const SCROLL_STEP_RATIO = 0.7;

/**
 * Khung cuộn ngang còn nội dung bên trái / bên phải hay không - cho hai mũi tên gợi ý.
 *
 * Chỉ một boolean: listener `scroll` (passive) + `ResizeObserver` gọi `setState` với cùng giá trị
 * thì React bỏ qua, nên cuộn không gây render mỗi khung hình. Khung không cuộn được (desktop xuống
 * dòng, hay hàng `display: contents`) luôn trả `false`.
 */
export function useScrollMore<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setCanLeft(el.scrollLeft > END_TOLERANCE_PX);
      setCanRight(el.scrollWidth - el.clientWidth - el.scrollLeft > END_TOLERANCE_PX);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  const scrollBy = useCallback((direction: 1 | -1) => {
    const el = ref.current;
    el?.scrollBy({ left: direction * el.clientWidth * SCROLL_STEP_RATIO, behavior: 'smooth' });
  }, []);

  return { ref, canLeft, canRight, scrollBy };
}
