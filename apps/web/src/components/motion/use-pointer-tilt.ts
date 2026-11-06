'use client';

import { useCallback, useRef } from 'react';

/** Chỉ thiết bị có chuột thật + không yêu cầu giảm chuyển động mới nghiêng. */
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function motionAllowed(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return (
    window.matchMedia(FINE_POINTER_QUERY).matches &&
    !window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

/**
 * Nghiêng 3D theo con trỏ — trả một ref callback. Hook CHỈ ghi CSS custom property lên phần tử
 * (ngoại lệ được phép của luật inline style: giá trị chỉ biết lúc runtime); hình dạng nghiêng,
 * vệt sáng và chuyển tiếp nằm trong CSS module của chỗ dùng:
 *
 * - `--tilt-rx` / `--tilt-ry`: góc xoay (deg), tối đa `maxDeg`.
 * - `--glare-x` / `--glare-y`: vị trí con trỏ (%) cho vệt sáng `radial-gradient`.
 *
 * Gom theo rAF (một lần ghi mỗi khung hình), rời chuột thì trả về 0. Không có JS / màn cảm ứng /
 * giảm chuyển động ⇒ không biến nào được ghi, CSS rơi về giá trị mặc định (phẳng).
 */
export function usePointerTilt<T extends HTMLElement>(maxDeg = 6) {
  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback(
    (node: T | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (!node || !motionAllowed()) return;

      let frame = 0;
      let px = 0.5;
      let py = 0.5;

      const write = () => {
        frame = 0;
        node.style.setProperty('--tilt-rx', `${((0.5 - py) * 2 * maxDeg).toFixed(2)}deg`);
        node.style.setProperty('--tilt-ry', `${((px - 0.5) * 2 * maxDeg).toFixed(2)}deg`);
        node.style.setProperty('--glare-x', `${(px * 100).toFixed(1)}%`);
        node.style.setProperty('--glare-y', `${(py * 100).toFixed(1)}%`);
      };
      const onMove = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse') return;
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
        if (frame === 0) frame = window.requestAnimationFrame(write);
      };
      const onLeave = () => {
        if (frame !== 0) window.cancelAnimationFrame(frame);
        frame = 0;
        for (const name of ['--tilt-rx', '--tilt-ry', '--glare-x', '--glare-y']) {
          node.style.removeProperty(name);
        }
      };

      node.addEventListener('pointermove', onMove, { passive: true });
      node.addEventListener('pointerleave', onLeave);
      cleanupRef.current = () => {
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerleave', onLeave);
        onLeave();
      };
    },
    [maxDeg],
  );
}
