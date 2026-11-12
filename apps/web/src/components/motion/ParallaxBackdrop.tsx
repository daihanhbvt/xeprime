'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Lớp ảnh nền trôi CHẬM hơn trang khi cuộn - cách jarallax làm (khối CTA "Connect with us" của
 * Rentgo): mỗi khung hình đọc vị trí khung cha rồi dịch lớp ảnh `translate3d` để ảnh đi được
 * `speed` lần quãng cuộn (0.5 = nửa tốc độ, trông gần như đứng yên sau "ô cửa").
 *
 * CSS nơi dùng đặt lớp ảnh canh giữa khung (`top: 50%` + `translate: 0 -50%`) và CAO ĐÚNG tỉ lệ
 * ảnh - ảnh không bị phóng to; phần cao hơn khung là quãng trôi.
 *
 * Chạy ngoài React (ref + rAF), không setState theo cuộn. Giảm chuyển động ⇒ đứng yên.
 */
export function ParallaxBackdrop({
  className,
  speed = 0.5,
  children,
}: {
  className?: string;
  speed?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const layer = ref.current;
    const frame = layer?.parentElement;
    if (!layer || !frame) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let raf = 0;
    let target = 0;
    const measure = () => {
      const rect = frame.getBoundingClientRect();
      const vh = window.innerHeight;
      // Lớp ảnh do CSS đặt cao ĐÚNG tỉ lệ ảnh (không phóng to). Phần cao hơn khung là quãng trôi;
      // rải quãng đó đều suốt lúc khung đi qua màn (đáy màn → đỉnh màn = ±(màn + khung)/2) ⇒ ảnh
      // trôi liên tục, không khựng, không lộ nền. Ảnh càng dư nhiều ⇒ trôi càng mạnh (trần 1 - speed).
      const maxShift = Math.max(0, (layer.offsetHeight - rect.height) / 2);
      const factor = Math.min(1 - speed, maxShift / ((vh + rect.height) / 2));
      // 0 khi khung nằm giữa màn; khung đi lên ⇒ ảnh đi lên chậm hơn.
      const centerOffset = rect.top - (vh - rect.height) / 2;
      target = Math.max(-maxShift, Math.min(maxShift, -centerOffset * factor));
      return rect.bottom >= -vh && rect.top <= vh * 2;
    };
    // Cập nhật THẲNG theo cuộn như jarallax - không nội suy đuổi theo (nội suy làm ảnh trễ sau
    // thanh cuộn, đọc thành "lag"). Đặt ngay trong sự kiện cuộn để không trễ một khung hình.
    const apply = () => {
      if (!measure()) return;
      layer.style.transform = `translate3d(0, calc(-50% + ${target.toFixed(2)}px), 0)`;
    };
    const update = apply;
    const schedule = () => {
      apply();
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        apply();
      });
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
      layer.style.transform = '';
    };
  }, [speed]);

  return (
    <span ref={ref} className={className} aria-hidden="true">
      {children}
    </span>
  );
}
