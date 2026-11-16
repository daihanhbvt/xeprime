import { cx } from '@/lib/cx';
import styles from './DiscountTag.module.css';
import { useTranslations } from 'next-intl';

interface DiscountTagProps {
  percent: number;
  /** `sm` dùng trong tab/gói nhỏ; mặc định dùng cho card, chi tiết và màn quản lý. */
  size?: 'sm' | 'md';
  /**
   * `badge` — huy hiệu trên ảnh thẻ xe của design v2 (ADR 0062): nền gold nhạt, chữ "10% off".
   * Mặc định là viên `-10%` của các màn còn lại.
   */
  variant?: 'pill' | 'badge' | 'corner';
  /**
   * Chỉ cho `corner`: ô chứa nó đang được chọn ⇒ nhãn theo màu nhấn của ô (vàng) thay cho màu
   * ưu đãi (xanh).
   */
  active?: boolean;
  /** Chỉ cho `corner`: ưu đãi TỐT NHẤT trong nhóm ⇒ màu giảm giá (đỏ). `active` thắng nếu cả hai. */
  best?: boolean;
  /** Chỉ dùng cho bố trí như ghim tag lên ảnh/góc gói; màu và chữ vẫn do common sở hữu. */
  className?: string;
}

/** Tag phần trăm giảm giá duy nhất của web — màu, typography và nội dung không trôi giữa màn. */
export function DiscountTag({
  percent,
  size = 'md',
  variant = 'pill',
  active = false,
  best = false,
  className,
}: DiscountTagProps) {
  const tCommon = useTranslations('Common');
  const normalized = Math.abs(percent);

  if (variant === 'badge') {
    return (
      <span
        className={cx(styles.badge, className)}
        aria-label={tCommon('components.discount', { percent: normalized })}
      >
        {tCommon('components.discountBadge', { percent: normalized })}
      </span>
    );
  }

  if (variant === 'corner') {
    // Nhãn GÓC: ô cha cần `position: relative` + `overflow: hidden` để nhãn ôm sát góc trên-phải.
    return (
      <span
        className={cx(
          styles.corner,
          active ? styles.cornerActive : best && styles.cornerBest,
          className,
        )}
        aria-label={tCommon('components.discount', { percent: normalized })}
      >
        -{normalized}%
      </span>
    );
  }

  return (
    <span
      className={cx(styles.tag, size === 'sm' && styles.small, className)}
      aria-label={tCommon('components.discount', { percent: normalized })}
    >
      -{normalized}%
    </span>
  );
}
