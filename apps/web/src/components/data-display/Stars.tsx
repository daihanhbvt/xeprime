import { RATING_MAX } from '@xeprime/types';
import { cx } from '@/lib/cx';
import styles from './Stars.module.css';
import { useTranslations } from 'next-intl';

/**
 * Hiển thị số sao (chỉ đọc). Dùng ký tự ★ thay vì AntD Rate để render được ở cả Server
 * Component (trang chi tiết marketplace SEO) lẫn Client. Số sao tối đa lấy từ @xeprime/types.
 */
export function Stars({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const tCommon = useTranslations('Common');
  const filled = Math.round(value);
  return (
    <span
      className={cx(styles.stars, size === 'sm' && styles.sm)}
      aria-label={tCommon('components.rating', { value, max: RATING_MAX })}
    >
      {Array.from({ length: RATING_MAX }, (_, i) => (
        <span key={i} className={i < filled ? styles.on : styles.off} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}
