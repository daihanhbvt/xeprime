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

/** Nền cả thẻ theo tông — chỉ dùng ở biến thể `tinted`. */
const TINT_CLASS: Record<StatTone, string | undefined> = {
  green: styles.tintGreen,
  blue: styles.tintBlue,
  gold: styles.tintGold,
  red: styles.tintRed,
};

/** Thẻ số liệu ở đầu dashboard: ô icon màu pastel + nhãn + giá trị lớn. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
  danger,
  loading,
  onClick,
  variant = 'default',
}: {
  label: string;
  value: ReactNode;
  /**
   * Dòng phụ dưới giá trị — nói KỲ hoặc MẪU SỐ của con số ("Tháng này", "3 đơn").
   * Một số tiền không kèm kỳ là một số không kiểm chứng được.
   */
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  tone: StatTone;
  /** Tô đỏ giá trị (vd "Quá hạn trả"). */
  danger?: boolean;
  loading?: boolean;
  /** Có đích để đi tiếp thì thẻ thành `<button>`; không có thì vẫn là một khối tĩnh. */
  onClick?: () => void;
  /**
   * `'default'` — thẻ trắng gọn của dashboard.
   * `'tinted'` — cả thẻ nhuộm theo tông, icon tròn và số lớn hơn: dải số liệu đầu trang danh mục
   * quản trị (trang "Gói dịch vụ"), nơi bốn con số là thứ đầu tiên người xem đọc.
   */
  variant?: 'default' | 'tinted';
}) {
  const tinted = variant === 'tinted';
  const cardClass = cx(styles.card, tinted && styles.tinted, tinted && TINT_CLASS[tone]);
  const body = (
    <>
      <span className={cx(styles.iconTile, TONE_CLASS[tone])}>
        {createElement(icon, { className: styles.icon })}
      </span>
      <div className={styles.body}>
        <div className={styles.label}>{label}</div>
        <div className={cx(styles.value, danger && styles.danger)}>{loading ? '…' : value}</div>
        {hint ? <div className={styles.hint}>{loading ? null : hint}</div> : null}
      </div>
    </>
  );

  // Thẻ bấm được phải là `<button>` chứ không phải `<div onClick>`: bàn phím và trình đọc màn
  // hình chỉ thấy được cái thứ nhất.
  if (onClick) {
    return (
      <button type="button" className={cx(cardClass, styles.clickable)} onClick={onClick}>
        {body}
      </button>
    );
  }

  return <div className={cardClass}>{body}</div>;
}
