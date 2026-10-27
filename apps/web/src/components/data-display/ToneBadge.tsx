import type { ReactNode } from 'react';
import type { DriverTripBadgeTone } from '@xeprime/domain';
import { cx } from '@/lib/cx';
import styles from './ToneBadge.module.css';

export type BadgeTone = DriverTripBadgeTone;

/**
 * Viên trạng thái kiểu Figma "_Badge" — sắc do nơi gọi chọn qua một hàm luật ở `@xeprime/domain`
 * (vd. `driverTripBadges`, `driverLinkTone`), chữ do nơi gọi dịch. Không `'use client'`.
 */
export function ToneBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={cx(styles.badge, styles[tone])}>{children}</span>;
}
