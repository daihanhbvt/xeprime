'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './MoneyStat.module.css';

/**
 * Sắc thái của một con số tiền — nói CON SỐ NÀY LÀ GÌ, không nói tốt hay xấu.
 *
 * `positive`/`negative` chỉ dùng cho chiều tiền vào/ra và cho một số dư có thể âm. Một khoản chi
 * lớn không phải là "lỗi", nên không sắc thái nào mượn `color-error` để chê người dùng.
 */
export type MoneyStatTone = 'positive' | 'negative' | 'neutral' | 'accent';

interface MoneyStatProps {
  label: string;
  /** Giá trị ĐÃ ĐỊNH DẠNG (qua `fmt.money`). `null` ⇒ hiện `—`. */
  value: string | null;
  tone?: MoneyStatTone;
  /** `lead` cho lớp thẻ chính, `compact` cho hàng thẻ phụ. */
  size?: 'lead' | 'compact';
  /** Dòng phụ giải thích con số: "Tiền mặt 3tr · CK 8tr", "7 đơn", "biên 76,6%". */
  hint?: ReactNode;
  loading?: boolean;
  /** Biến thẻ thành đường dẫn tới danh sách sinh ra con số này (docs/design/09 §3.1). */
  href?: string;
}

const TONE_CLASS: Record<MoneyStatTone, string | undefined> = {
  positive: styles.positive,
  negative: styles.negative,
  neutral: styles.neutral,
  accent: styles.accent,
};

/**
 * Một ô số tiền — thẻ tổng của sổ Thu-Chi và ba lớp tiền của Tổng quan doanh thu dùng CHUNG
 * component này.
 *
 * Trước đây `ReceiptSummaryCards` giữ một bản `Card` nội bộ; bản thứ hai sắp mọc ở màn tổng quan
 * là lúc phải tách (`shared-code`). Hai bản sẽ trôi khỏi nhau ngay lần đầu ai đó chỉnh cỡ chữ ở
 * một màn — mà người dùng thì đọc hai màn đó cạnh nhau.
 *
 * Số tiền dùng `tabular-nums` để các thẻ xếp cạnh nhau có chữ số thẳng cột (brand guide §4).
 */
export function MoneyStat({
  label,
  value,
  tone = 'neutral',
  size = 'lead',
  hint,
  loading,
  href,
}: MoneyStatProps) {
  const body = (
    <>
      <span className={styles.label}>{label}</span>
      {loading ? (
        <span className={styles.skeleton} aria-hidden />
      ) : (
        <span className={cx(styles.value, size === 'compact' && styles.compact, TONE_CLASS[tone])}>
          {value ?? '—'}
        </span>
      )}
      {hint && !loading ? <span className={styles.hint}>{hint}</span> : null}
    </>
  );

  // Thẻ bấm được là một LIÊN KẾT thật, không phải `div` gắn `onClick`: mở tab mới, sao chép
  // đường dẫn và điều hướng bằng bàn phím phải chạy như mọi liên kết khác trong sản phẩm.
  if (href) {
    return (
      <Link className={cx(styles.card, styles.link)} href={href}>
        {body}
      </Link>
    );
  }

  return <div className={styles.card}>{body}</div>;
}
