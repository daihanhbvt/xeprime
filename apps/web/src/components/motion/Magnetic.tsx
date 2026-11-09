'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './motion.module.css';

/** Phần tử bị "hút" tối đa bao nhiêu phần quãng từ tâm tới con trỏ. */
const PULL = 0.3;
/** Trần độ lệch (px) — nút lớn cũng không trôi khỏi chỗ. */
const MAX_SHIFT = 10;

/**
 * Hiệu ứng "magnetic": nút trôi nhẹ theo con trỏ khi chuột ở trên nó, nhả ra thì bật về chỗ cũ.
 * Bọc ngoài một nút (vd. `CtaButton`, vốn render được trong Server Component nên không tự mang
 * hook). Chỉ ghi CSS custom property `--mag-x/--mag-y` (giá trị runtime); `translate` + chuyển tiếp
 * ở `motion.module.css`. Màn cảm ứng / giảm chuyển động / chưa có JS ⇒ đứng yên.
 *
 * `translate` không đổi hộp bố cục — không layout shift. Lớp bọc là `inline-flex`; nút `block`
 * thì truyền `block` để lớp bọc cũng rộng hết hàng.
 */
export function Magnetic({
  children,
  className,
  block = false,
}: {
  children: ReactNode;
  className?: string;
  block?: boolean;
}) {
  const cleanupRef = useRef<(() => void) | null>(null);

  const ref = useCallback((node: HTMLSpanElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node || typeof window.matchMedia !== 'function') return;
    if (
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    let frame = 0;
    let dx = 0;
    let dy = 0;
    const clamp = (v: number) => Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, v));
    const write = () => {
      frame = 0;
      node.style.setProperty('--mag-x', `${clamp(dx * PULL).toFixed(1)}px`);
      node.style.setProperty('--mag-y', `${clamp(dy * PULL).toFixed(1)}px`);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const rect = node.getBoundingClientRect();
      dx = event.clientX - (rect.left + rect.width / 2);
      dy = event.clientY - (rect.top + rect.height / 2);
      if (frame === 0) frame = window.requestAnimationFrame(write);
    };
    const onLeave = () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      frame = 0;
      node.style.removeProperty('--mag-x');
      node.style.removeProperty('--mag-y');
    };
    node.addEventListener('pointermove', onMove, { passive: true });
    node.addEventListener('pointerleave', onLeave);
    cleanupRef.current = () => {
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
      onLeave();
    };
  }, []);

  return (
    <span ref={ref} className={cx(styles.magnetic, block && styles.magneticBlock, className)}>
      {children}
    </span>
  );
}
