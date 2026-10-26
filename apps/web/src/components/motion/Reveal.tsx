'use client';

import { createElement, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import {
  enterClass,
  motionDelayClass,
  revealGateClass,
  staggerClass,
  type MotionDelay,
} from './motion-classes';
import { useReveal } from './use-reveal';

type RevealTag = 'div' | 'section' | 'ul' | 'ol' | 'li' | 'header' | 'article' | 'figure';

/**
 * - `fadeUp`  — chính khối trượt lên + hiện dần (≈ `wow fadeInUp`).
 * - `stagger` — các phần tử CON lần lượt trượt lên, mỗi mục trễ 0.2s (danh sách, các bước).
 * - `none`    — khối đứng yên, chỉ làm CỔNG: `enterClass`/`SplitText` bên trong chờ cuộn tới.
 */
export type RevealEffect = 'fadeUp' | 'stagger' | 'none';

/**
 * Khối hiện ra khi cuộn tới (≈ WOW.js + animate.css `fadeInUp` của trang mẫu), một lần duy nhất.
 *
 * Client island mỏng: con là Server Component vẫn render ở server, chỉ cái vỏ này cần JS. Không
 * thêm thẻ bọc khi đã có sẵn một thẻ — truyền `as` (`ul`, `section`…) để Reveal CHÍNH LÀ thẻ đó.
 */
export function Reveal({
  as = 'div',
  effect = 'fadeUp',
  delay,
  className,
  children,
  ...rest
}: {
  as?: RevealTag;
  effect?: RevealEffect;
  /** Trễ của chính khối (`fadeUp`), và của `SplitText`/`enterClass()` không tự khai trễ bên trong. */
  delay?: MotionDelay;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  const ref = useReveal<HTMLElement>();

  return createElement(
    as,
    {
      ...rest,
      ref,
      className: cx(
        revealGateClass,
        // Khối không tự trượt vẫn mang lớp trễ — biến trễ được kế thừa xuống chữ bên trong.
        effect === 'fadeUp' ? enterClass(delay) : motionDelayClass(delay),
        effect === 'stagger' && staggerClass,
        className,
      ),
    },
    children,
  );
}
