'use client';

import type { ComponentType, ReactNode } from 'react';
import { createElement } from 'react';
import { cx } from '@/lib/cx';
import styles from './StatCard.module.css';

export type StatTone = 'green' | 'blue' | 'gold' | 'red';

const TONE_CLASS: Record<StatTone, string | undefined> = {
  green: styles.green,
  blue: styles.blue,
  gold: styles.gold,
  red: styles.red,
};

/** Thẻ số liệu ở đầu dashboard: ô icon màu pastel + nhãn + giá trị lớn. */
export function StatCard({
  label,
  value,
  icon,
  tone,
  danger,
  loading,
}: {
  label: string;
  value: ReactNode;
  icon: ComponentType<{ className?: string }>;
  tone: StatTone;
  /** Tô đỏ giá trị (vd "Quá hạn trả"). */
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <div className={styles.card}>
      <span className={cx(styles.iconTile, TONE_CLASS[tone])}>
        {createElement(icon, { className: styles.icon })}
      </span>
      <div className={styles.body}>
        <div className={styles.label}>{label}</div>
        <div className={cx(styles.value, danger && styles.danger)}>
          {loading ? '…' : value}
        </div>
      </div>
    </div>
  );
}
