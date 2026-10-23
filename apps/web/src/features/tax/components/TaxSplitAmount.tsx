'use client';

import { useAppFormat } from '@/i18n/use-app-format';
import { isNegativeMoney } from '@/lib/money';

import styles from './TaxSplitAmount.module.css';

interface TaxSplitAmountProps {
  /** Số tiền (VND chuỗi) — ÂM ở bút toán đảo; `null` ở dòng một-mức trước ADR 0068. */
  value: string | null;
  /** Chữ thay cho dòng không tách — nơi gọi truyền từ namespace của chính bề mặt đó. */
  fallback: string;
}

/**
 * Một sắc thuế (GTGT hoặc TNCN) của một dòng sổ thuế — dùng chung cho sổ thuế của nền tảng
 * (`TaxPeriodPanel`) và thẻ "Thuế đã khấu trừ" của chủ xe (`ShopTaxWithheldCard`).
 *
 * `null` ⇒ dòng một-mức trước ADR 0068: sổ không bịa ra phép tách mà lúc đó không ai tính. Dấu âm
 * so trên CHUỖI (`isNegativeMoney`), không qua `Number` — ADR 0007.
 */
export function TaxSplitAmount({ value, fallback }: TaxSplitAmountProps) {
  if (value == null) return <span className={styles.muted}>{fallback}</span>;
  return <TaxAmount value={value} />;
}

/**
 * Một số tiền thuế đọc được là ÂM khi là bút toán đảo. Màu chỉ giúp tìm nhanh — `fmt.money` đã in
 * dấu trừ, và đó mới là tín hiệu mang nghĩa (người mù màu vẫn đọc đúng).
 */
export function TaxAmount({ value }: { value: string }) {
  const fmt = useAppFormat();
  return (
    <span className={isNegativeMoney(value) ? styles.negative : styles.amount}>
      {fmt.money(value)}
    </span>
  );
}
