'use client';

import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import type { WaitingAge } from '../waiting-age';
import styles from './WaitingAgeText.module.css';

/** "2 ngày" / "5 giờ" / "12 phút" — tô màu lỗi khi đã quá mốc khẩn. */
export function useWaitingAgeLabel() {
  const t = useTranslations('PlatformMoney.age');
  return (age: WaitingAge): string => {
    // Nhánh tường minh thay vì khoá dựng bằng template string: next-intl kiểm khoá lúc biên dịch.
    switch (age.unit) {
      case 'days':
        return t('days', { count: age.count });
      case 'hours':
        return t('hours', { count: age.count });
      default:
        return t('minutes', { count: age.count });
    }
  };
}

export function WaitingAgeText({ age, urgent }: { age: WaitingAge; urgent: boolean }) {
  const label = useWaitingAgeLabel();
  return <span className={cx(styles.age, urgent && styles.urgent)}>{label(age)}</span>;
}
