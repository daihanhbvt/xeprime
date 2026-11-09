import { RATING_MAX } from '@xeprime/types';
import { cx } from '@/lib/cx';
import { seqClass, starPopClass } from '@/components/motion/motion-classes';
import styles from './Stars.module.css';
import { useTranslations } from 'next-intl';

/** Sao Figma "Star icon" (`19707:83357`): đặc #FEC84B, trống #F5F5F5 — MỘT bộ sao cho cả web. */
export const STAR_ON_SRC = '/home/review-star-on.svg';
export const STAR_OFF_SRC = '/home/review-star-off.svg';

const SIZE_PX = { sm: 14, md: 16, lg: 20, xl: 28 } as const;

/**
 * Dãy sao (chỉ đọc). Ảnh SVG thuần (không AntD) nên render được ở cả Server Component (trang chi
 * tiết marketplace SEO) lẫn Client. Số sao tối đa lấy từ @xeprime/types.
 */
export function Stars({
  value,
  size = 'md',
  animated = false,
}: {
  value: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Sao bật lần lượt khi được vẽ (site khách) - mặc định đứng yên. */
  animated?: boolean;
}) {
  const tCommon = useTranslations('Common');
  const filled = Math.round(value);
  const px = SIZE_PX[size];
  return (
    <span
      className={cx(styles.stars, styles[size], animated && seqClass)}
      role="img"
      aria-label={tCommon('components.rating', { value, max: RATING_MAX })}
    >
      {Array.from({ length: RATING_MAX }, (_, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={i < filled ? STAR_ON_SRC : STAR_OFF_SRC}
          alt=""
          width={px}
          height={px}
          className={cx(styles.star, animated && starPopClass)}
        />
      ))}
    </span>
  );
}

/** Một ngôi sao đặc — điểm trung bình cạnh con số ("★ 4.7"). Cùng file sao với `Stars`. */
export function RatingStar({ size = 16, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={STAR_ON_SRC}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={cx(styles.single, className)}
    />
  );
}
