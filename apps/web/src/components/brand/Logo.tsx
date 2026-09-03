import Image from 'next/image';
import { APP_NAME } from '@/constants/app-name';
import { cx } from '@/lib/cx';
import styles from './Logo.module.css';

/**
 * Logo thương hiệu — file THẬT ở `apps/web/public/brand/`, không còn bản mô phỏng bằng SVG.
 *
 * Hai file, hai vai trò khác nhau chứ không phải hai kích thước của một thứ:
 * - `xeprime-logo.png` — lockup ngang (biểu tượng + chữ), dùng ở mọi chỗ có bề ngang.
 * - `xeprime-mark.png` — biểu tượng vuông bo góc (nền gradient vàng, glyph trắng), dùng khi
 *   sidebar thu gọn. Cùng một artwork với favicon/app icon ở `src/app/`, nên tab trình duyệt
 *   và cột 64px hiện đúng một hình.
 *
 * Đổi logo về sau: thay file trong `public/brand/` (và bộ icon ở `src/app/`), chỉnh `RATIO` nếu
 * tỉ lệ khác — mọi nơi dùng `<Logo/>` không phải sửa.
 */
type LogoSize = 'sm' | 'md' | 'lg';
type LogoVariant = 'full' | 'mark';

interface LogoProps {
  /** `full` = lockup ngang; `mark` = chỉ biểu tượng vuông. */
  variant?: LogoVariant;
  size?: LogoSize;
  className?: string;
}

/** Tỉ lệ THẬT của file (rộng ÷ cao) — sai số ở đây là logo bị bóp méo. */
const RATIO: Record<LogoVariant, number> = {
  full: 1024 / 331,
  mark: 1,
};

/** Chiều cao hiển thị; bề ngang suy ra từ `RATIO` để không bao giờ lệch tỉ lệ. */
const HEIGHT: Record<LogoSize, Record<LogoVariant, number>> = {
  sm: { full: 30, mark: 30 },
  md: { full: 38, mark: 38 },
  lg: { full: 54, mark: 60 },
};

const SRC: Record<LogoVariant, string> = {
  full: '/brand/xeprime-logo.png',
  mark: '/brand/xeprime-mark.png',
};

export function Logo({ variant = 'full', size = 'md', className }: LogoProps) {
  const height = HEIGHT[size][variant];

  return (
    <Image
      src={SRC[variant]}
      alt={APP_NAME}
      width={Math.round(height * RATIO[variant])}
      height={height}
      /* Logo nằm ở header/sidebar — lazy load sẽ thành một nhịp trống ngay trên nếp gấp. */
      loading="eager"
      className={cx(styles.logo, className)}
    />
  );
}
