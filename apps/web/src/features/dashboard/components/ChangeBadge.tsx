'use client';

import { ArrowDownOutlined, ArrowUpOutlined, MinusOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import styles from './ChangeBadge.module.css';

/**
 * Mũi tên so với CÙNG KỲ tháng trước, dưới con số của thẻ KPI.
 *
 * - `percent`: thay đổi tương đối của một số đếm/tiền (`countChangePercent`/`moneyChangePercent`);
 * - `points`: chênh lệch ĐIỂM của một tỉ lệ (lấp đầy 40% → 50% là "+10 điểm", không phải +25%).
 *
 * `null` là "chưa có gì để so" — hiện thành chữ, KHÔNG thành 0%: một gian hàng tháng trước chưa có
 * chuyến nào mà thẻ báo "0%" là nói sai về họ.
 *
 * Màu theo NGHĨA, không theo dấu: `positiveIsGood={false}` cho đại lượng mà tăng là xấu (huỷ đơn).
 */
export function ChangeBadge({
  value,
  unit = 'percent',
  positiveIsGood = true,
}: {
  value: number | null;
  unit?: 'percent' | 'points';
  positiveIsGood?: boolean;
}) {
  const t = useTranslations('Dashboard.change');

  if (value === null) {
    return <span className={cx(styles.badge, styles.none)}>{t('none')}</span>;
  }

  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const magnitude = Math.abs(value);
  const text =
    direction === 'flat'
      ? t('flat')
      : unit === 'points'
        ? t(direction === 'up' ? 'pointsUp' : 'pointsDown', { value: magnitude })
        : t(direction, { value: magnitude });
  const good = direction === 'flat' ? null : (direction === 'up') === positiveIsGood;
  const Icon = direction === 'up' ? ArrowUpOutlined : direction === 'down' ? ArrowDownOutlined : MinusOutlined;

  return (
    <span
      className={cx(
        styles.badge,
        good === true && styles.good,
        good === false && styles.bad,
        good === null && styles.flat,
      )}
    >
      <Icon className={styles.icon} aria-hidden />
      <span className={styles.value}>{text}</span>
      <span className={styles.suffix}>{t('suffix')}</span>
    </span>
  );
}
