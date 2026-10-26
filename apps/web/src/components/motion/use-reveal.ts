'use client';

import { useCallback } from 'react';

const PENDING = 'pending';

/**
 * ≈ ScrollTrigger `start: "top 95%"` của trang mẫu: khối hiện khi mép trên của nó lên tới 95% chiều
 * cao màn hình. Cùng con số dùng cho phép thử "đã thấy sẵn lúc gắn" bên dưới.
 */
const TRIGGER_RATIO = 0.95;
const ROOT_MARGIN = `0px 0px -${Math.round((1 - TRIGGER_RATIO) * 100)}% 0px`;

let sharedObserver: IntersectionObserver | null = null;

/**
 * MỘT observer cho mọi khối của trang (thay vì mỗi khối một cái) — trình duyệt gộp phép tính giao
 * cắt; mỗi khối chỉ được báo một lần rồi bị bỏ theo dõi (hiện một lần, như WOW.js).
 */
function observer(): IntersectionObserver {
  sharedObserver ??= new IntersectionObserver(
    (entries, io) => {
      for (const entry of entries) {
        // Đã cuộn vượt qua (mép trên ở phía trên màn) mà chưa kịp báo ⇒ cũng hiện luôn.
        if (!entry.isIntersecting && entry.boundingClientRect.top > 0) continue;
        entry.target.removeAttribute('data-reveal');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: ROOT_MARGIN },
  );
  return sharedObserver;
}

/**
 * Callback ref cho khối "hiện ra khi cuộn tới" (lớp `gate` của `motion.module.css`).
 *
 * Chỉ khối còn nằm DƯỚI màn hình lúc gắn mới bị đặt `data-reveal="pending"` (ẩn, chờ). Khối đang
 * thấy sẵn thì để yên — hoạt cảnh CSS của nó đã chạy cùng lúc tải trang, đặt chờ rồi chạy lại sẽ
 * làm nó loé tắt. HTML server không bao giờ mang trạng thái chờ, nên tắt JS nội dung vẫn hiện.
 *
 * Ghi thẳng thuộc tính DOM thay vì state: không render lại, và attribute này React không quản.
 */
export function useReveal<T extends HTMLElement>(): (node: T | null) => (() => void) | undefined {
  return useCallback((node: T | null) => {
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    if (node.getBoundingClientRect().top < window.innerHeight * TRIGGER_RATIO) return undefined;

    node.setAttribute('data-reveal', PENDING);
    const io = observer();
    io.observe(node);
    return () => {
      io.unobserve(node);
      node.removeAttribute('data-reveal');
    };
  }, []);
}
