'use client';

import { Skeleton } from 'antd';
import type { ComponentType, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './SummaryStrip.module.css';

export type SummaryStripTone = 'neutral' | 'info' | 'success' | 'danger' | 'warning' | 'purple';

export interface SummaryStripItem {
  key: string;
  icon: ComponentType;
  tone: SummaryStripTone;
  value: ReactNode;
  label: string;
  /** Tô đỏ CON SỐ (vd. còn nợ khác 0) — khác `tone`, vốn chỉ tô vòng biểu tượng. */
  danger?: boolean;
}

/**
 * Dải số liệu đầu danh sách ở site partner — Figma Partner-XePrime "Vehicle Summary" (Khách hàng
 * `23777:53832`, Tài xế `23737:44163`): MỘT thẻ, các ô chia đều bề ngang, biểu tượng tròn + số + nhãn.
 *
 * Có `onSelect` thì mỗi ô là một nút lọc (`aria-pressed`), ô đang chọn tô viền — dùng khi dải số
 * cũng là lối lọc nhanh của danh sách bên dưới (màn Tài xế). Không có thì chỉ để đọc.
 */
export function SummaryStrip({
  items,
  loading = false,
  ariaLabel,
  active,
  onSelect,
}: {
  items: readonly SummaryStripItem[];
  loading?: boolean;
  ariaLabel: string;
  active?: string | null;
  onSelect?: (key: string) => void;
}) {
  return (
    <section className={styles.strip} aria-label={ariaLabel}>
      {items.map((item) => {
        const Icon = item.icon;
        const body = (
          <>
            <span className={cx(styles.icon, styles[item.tone])} aria-hidden="true">
              <Icon />
            </span>
            <span className={styles.text}>
              {loading ? (
                <Skeleton.Input active size="small" className={styles.skeleton} />
              ) : (
                <b className={cx(styles.value, item.danger && styles.valueDanger)}>{item.value}</b>
              )}
              <span className={styles.label}>{item.label}</span>
            </span>
          </>
        );
        return onSelect ? (
          <button
            key={item.key}
            type="button"
            className={cx(styles.item, styles.selectable, active === item.key && styles.active)}
            aria-pressed={active === item.key}
            onClick={() => onSelect(item.key)}
          >
            {body}
          </button>
        ) : (
          <div key={item.key} className={styles.item}>
            {body}
          </div>
        );
      })}
    </section>
  );
}
