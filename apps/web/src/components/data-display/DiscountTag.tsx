import { cx } from '@/lib/cx';
import styles from './DiscountTag.module.css';
import { useTranslations } from 'next-intl';

interface DiscountTagProps {
  percent: number;
  /** `sm` dùng trong tab/gói nhỏ; mặc định dùng cho card, chi tiết và màn quản lý. */
  size?: 'sm' | 'md';
  /** Chỉ dùng cho bố trí như ghim tag lên ảnh/góc gói; màu và chữ vẫn do common sở hữu. */
  className?: string;
}

/** Tag phần trăm giảm giá duy nhất của web — màu, typography và nội dung không trôi giữa màn. */
export function DiscountTag({ percent, size = 'md', className }: DiscountTagProps) {
  const tCommon = useTranslations('Common');
  const normalized = Math.abs(percent);

  return (
    <span
      className={cx(styles.tag, size === 'sm' && styles.small, className)}
      aria-label={tCommon('components.discount', { percent: normalized })}
    >
      -{normalized}%
    </span>
  );
}
