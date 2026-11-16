'use client';

import { useEffect, type RefObject } from 'react';

/** Thôi cuộn bao lâu thì coi là đã dừng. */
const IDLE_MS = 800;

/**
 * Gắn `data-scrolling` lên phần tử trong lúc nó ĐANG cuộn, gỡ khi đã dừng `IDLE_MS`. CSS dùng cờ
 * này để thanh cuộn mờ khi đứng yên và hiện rõ lúc cuộn (bảng Kanban, 10/11/2026). Ghi thẳng
 * thuộc tính DOM, không qua state: mỗi sự kiện cuộn mà render lại cả cột là phí.
 */
export function useScrollingFlag(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    let timer: number | undefined;
    const onScroll = () => {
      node.setAttribute('data-scrolling', '');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => node.removeAttribute('data-scrolling'), IDLE_MS);
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      node.removeEventListener('scroll', onScroll);
    };
  }, [ref]);
}
