'use client';

import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { isPositiveMoney } from '@/lib/money';
import styles from './DeductedAmount.module.css';

/**
 * Một khoản TRỪ khỏi tiền chủ xe (hoa hồng `H`, thuế `T` — ADR 0064): số DƯƠNG trên dây, hiện kèm
 * dấu trừ và màu khoản trừ. Bằng 0 (hoặc không dương) thì hiện mờ, không dấu: "không bị trừ gì"
 * không phải một khoản trừ.
 *
 * Nguồn duy nhất của cách hiện khoản trừ ở sổ ví, xem trước lượt duyệt và chi tiết đơn — để ba
 * màn không trôi về ba kiểu dấu/màu khác nhau. So sánh trên CHUỖI (`isPositiveMoney`, ADR 0007).
 */
export function DeductedAmount({
  value,
  emphasis = false,
  className,
}: {
  value: string | null | undefined;
  /** Đậm chữ — dùng trong bảng/sổ, nơi khoản trừ phải bắt mắt giữa các cột tiền. */
  emphasis?: boolean;
  className?: string;
}) {
  const fmt = useAppFormat();
  if (!isPositiveMoney(value)) {
    return <span className={cx(styles.muted, className)}>{fmt.money('0')}</span>;
  }
  return (
    <span className={cx(styles.negative, emphasis && styles.emphasis, className)}>
      −{fmt.money(value)}
    </span>
  );
}
