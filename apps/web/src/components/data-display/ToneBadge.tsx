import type { ReactNode } from 'react';
import type { DriverTripBadgeTone } from '@xeprime/domain';
import { cx } from '@/lib/cx';
import styles from './ToneBadge.module.css';

export type BadgeTone = DriverTripBadgeTone;

/**
 * Viên trạng thái kiểu Figma "_Badge" — sắc do nơi gọi chọn qua một hàm luật ở `@xeprime/domain`
 * (vd. `driverTripBadges`, `driverLinkTone`), chữ do nơi gọi dịch. Không `'use client'`.
 *
 * `size="sm"`: viên 12px đứng cạnh một nhãn (design "_Badge" sm, đệm 2/8 - trang Tài khoản).
 */
export function ToneBadge({
  tone,
  size = 'md',
  children,
}: {
  tone: BadgeTone;
  size?: 'sm' | 'md';
  children: ReactNode;
}) {
  return (
    <span className={cx(styles.badge, size === 'sm' && styles.sm, styles[tone])}>{children}</span>
  );
}
