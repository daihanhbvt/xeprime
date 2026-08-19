'use client';

import { RECEIPT_TYPE } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import type { MoneyString } from '@xeprime/types';
import styles from './ReceiptAmount.module.css';

/**
 * Số tiền của một phiếu, kèm dấu và màu theo loại.
 *
 * Dấu `+`/`−` là THÔNG TIN nghiệp vụ (thu vs chi), không phải trang trí — mất nó là mất nửa
 * nghĩa của con số. Gom vào một component vì cùng cặp "dấu + màu + định dạng" từng nằm ở bốn
 * chỗ (bảng, thẻ mobile, drawer chi tiết, panel sổ khách), mỗi chỗ một bản `.income`/`.expense`
 * riêng — chỗ thứ năm chỉ cách một feature.
 */
export function ReceiptAmount({
  type,
  amount,
  size = 'inline',
}: {
  type: string;
  amount: MoneyString;
  /** `inline` cho ô bảng · `card` cho thẻ mobile · `hero` cho đầu drawer chi tiết. */
  size?: 'inline' | 'card' | 'hero';
}) {
  const fmt = useAppFormat();
  const income = type === RECEIPT_TYPE.INCOME;

  return (
    <span
      className={[styles[size], income ? styles.income : styles.expense].join(' ')}
    >
      {income ? '+' : '−'}
      {fmt.money(amount)}
    </span>
  );
}
