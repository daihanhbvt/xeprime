'use client';

import { useCallback } from 'react';

/** Tách "100+" → { prefix: '', value: 100, suffix: '+' }; không có số thì trả null. */
function parse(text: string): { prefix: string; value: number; suffix: string } | null {
  const match = /^(\D*)(\d[\d.,]*)(.*)$/.exec(text);
  if (!match) return null;
  const value = Number((match[2] ?? '').replace(/[.,]/g, ''));
  return Number.isFinite(value) ? { prefix: match[1] ?? '', value, suffix: match[3] ?? '' } : null;
}

/** Đọc thời lượng từ token `--xp-motion-duration-ticker` (giây) — một nguồn với CSS. */
function tickerMs(node: HTMLElement): number {
  const raw = getComputedStyle(node).getPropertyValue('--xp-motion-duration-ticker').trim();
  const seconds = Number.parseFloat(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1600;
}

/**
 * Số liệu đếm từ 0 lên khi cuộn tới (≈ "number ticker" của 21st.dev / counter của trang mẫu).
 *
 * SSR an toàn: HTML server mang CHÍNH con số cuối, JS chỉ ghi đè textContent trong lúc chạy rồi
 * trả về chuỗi gốc — tắt JS hay giảm chuyển động thì số đứng yên, không bao giờ kẹt ở 0. Trình đọc
 * màn hình đọc `aria-label` cố định, không nghe từng bước đếm.
 */
export function NumberTicker({ value, className }: { value: string; className?: string }) {
  const ref = useCallback(
    (node: HTMLSpanElement | null) => {
      const parsed = parse(value);
      if (!node || !parsed || typeof IntersectionObserver === 'undefined') return undefined;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

      let frame = 0;
      const run = () => {
        const duration = tickerMs(node);
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - (1 - t) ** 4;
          node.textContent =
            t >= 1 ? value : `${parsed.prefix}${Math.round(parsed.value * eased)}${parsed.suffix}`;
          if (t < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      };

      const io = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        run();
      });
      io.observe(node);
      return () => {
        io.disconnect();
        cancelAnimationFrame(frame);
        node.textContent = value;
      };
    },
    [value],
  );

  return (
    <span ref={ref} className={className} aria-label={value}>
      {value}
    </span>
  );
}
