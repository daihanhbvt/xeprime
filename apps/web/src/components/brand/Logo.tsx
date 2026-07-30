import { cx } from '@/lib/cx';
import styles from './Logo.module.css';

/**
 * Logo XePrime.
 *
 * ⚠️ TẠM: đây là bản mô phỏng (car glyph + wordmark) vẽ lại từ ảnh brand, CHƯA phải file
 * thật. Khi có logo chính thức: thả SVG vào `apps/web/public/brand/` rồi thay phần `<Mark/>`
 * bằng `<Image>` — chỉ sửa đúng file này, mọi nơi dùng `<Logo/>` không đổi.
 */
type LogoSize = 'sm' | 'md' | 'lg';

interface LogoProps {
  /** `full` = mark + chữ; `mark` = chỉ biểu tượng. */
  variant?: 'full' | 'mark';
  size?: LogoSize;
  /** `light` = đảo chữ sang trắng để đặt trên nền tối (hero, CTA chủ xe). */
  tone?: 'default' | 'light';
  className?: string;
}

function Mark({ className }: { className?: string }) {
  return (
    <span className={cx(styles.mark, className)} aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <path
          fill="#fff"
          d="M8 27h32l-5-10.5A5.5 5.5 0 0 0 30 13H20a5.5 5.5 0 0 0-4 1.8L10 22l-3 3Z"
        />
        <rect x="7" y="27" width="34" height="7" rx="3.5" fill="#fff" />
      </svg>
    </span>
  );
}

export function Logo({ variant = 'full', size = 'md', tone = 'default', className }: LogoProps) {
  if (variant === 'mark') {
    return <Mark className={cx(styles[size], className)} />;
  }
  return (
    <span
      className={cx(styles.logo, styles[size], tone === 'light' && styles.light, className)}
      aria-label="XePrime"
    >
      <Mark />
      <span className={styles.word}>
        <b>xe</b> <span>prime</span>
      </span>
    </span>
  );
}
