'use client';

import { absoluteMoney, isNegativeMoney, isZeroMoney } from '@/lib/money';
import { useAppFormat } from '@/i18n/use-app-format';
import styles from './SignedAmount.module.css';

/**
 * Số tiền có DẤU — dùng chung bảng tổng hợp, thẻ tổng hợp tháng và tab Biến động số dư.
 *
 * Dấu đứng trước và có màu riêng: trên một sổ tiền, hướng dòng tiền là thứ mắt phải bắt được
 * trước giá trị. Dùng cả dấu lẫn màu để không phụ thuộc khả năng phân biệt màu.
 *
 * `muted`: dòng không làm số dư nhúc nhích thật (lệnh rút bị từ chối / đã huỷ) — vẫn hiện số tiền
 * của lệnh, nhưng không mang màu của một khoản đã đi.
 */
export function SignedAmount({ value, muted = false }: { value: string; muted?: boolean }) {
  const fmt = useAppFormat();
  if (isZeroMoney(value)) return <span className={styles.muted}>{fmt.money('0')}</span>;
  const positive = !isNegativeMoney(value);
  const tone = muted ? styles.muted : positive ? styles.positive : styles.negative;
  return (
    <span className={tone}>
      {positive ? '+' : '−'}
      {fmt.money(absoluteMoney(value))}
    </span>
  );
}
