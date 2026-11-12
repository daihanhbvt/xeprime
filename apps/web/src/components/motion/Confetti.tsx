'use client';

import { useCallback } from 'react';
import styles from './motion.module.css';

const PIECES = 90;
const DURATION_MS = 1800;
/** Màu đọc từ token lúc chạy — một nguồn với theme, không gõ mã màu ở đây. */
const COLOR_TOKENS = [
  '--xp-color-primary',
  '--xp-color-success',
  '--xp-color-warning',
  '--xp-color-info',
] as const;

/**
 * Confetti nhẹ một lượt (canvas tự vẽ, không thư viện). Chỉ GẮN khi một kết cục thật đã xảy ra —
 * người gọi quyết (ví dụ đơn vừa ra đời sau đối soát, ADR 0044), component không tự suy.
 * Giảm chuyển động / SSR: không vẽ gì. Canvas `position: fixed`, không chiếm chỗ, không bắt chuột.
 */
export function Confetti() {
  const ref = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const css = getComputedStyle(canvas);
    const colors = COLOR_TOKENS.map((token) => css.getPropertyValue(token).trim() || '#f5a623');
    const pieces = Array.from({ length: PIECES }, (_, i) => ({
      x: width / 2 + (Math.random() - 0.5) * width * 0.3,
      y: height * 0.35,
      vx: (Math.random() - 0.5) * 9,
      vy: -(Math.random() * 9 + 5),
      size: Math.random() * 6 + 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[i % colors.length] ?? '#f5a623',
    }));

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = (now - start) / DURATION_MS;
      ctx.clearRect(0, 0, width, height);
      if (t >= 1) return;
      ctx.globalAlpha = 1 - t * t;
      for (const p of pieces) {
        p.vy += 0.25;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={ref} className={styles.confetti} aria-hidden="true" />;
}
