'use client';

import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './FilterChip.module.css';

/**
 * Viên lựa chọn của hộp Bộ lọc — Figma "Chip" (22588:51428): bo tròn, viền xám; đang chọn thì nền
 * vàng nhạt + viền vàng + chữ đậm. `size="sm"` là viên thấp của hàng điều kiện thuê, `tone="more"`
 * là viên "+N hãng xe khác" nền xám.
 *
 * Luôn là `<button aria-pressed>`: viên chọn-một và chọn-nhiều đều bật/tắt bằng một cú bấm, trình
 * đọc màn hình đọc đúng trạng thái mà không cần dựng radio ẩn.
 */
export function FilterChip({
  active = false,
  onClick,
  leading,
  size = 'md',
  tone = 'default',
  ariaLabel,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  /** Logo hãng 20px trước chữ. */
  leading?: ReactNode;
  size?: 'md' | 'sm';
  tone?: 'default' | 'more';
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cx(
        styles.chip,
        size === 'sm' && styles.small,
        tone === 'more' && styles.more,
        active && styles.active,
      )}
      aria-pressed={tone === 'more' ? undefined : active}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {leading ? <span className={styles.leading}>{leading}</span> : null}
      <span className={styles.label}>{children}</span>
    </button>
  );
}

/** Dấu sao vàng sau "Chủ xe 4.8+" / "Từ 4.8" — Figma tô riêng màu `status/warning-300`. */
export function ChipStar() {
  return (
    <span className={styles.star} aria-hidden="true">
      ★
    </span>
  );
}
