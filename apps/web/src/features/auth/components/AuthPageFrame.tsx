import type { ReactNode } from 'react';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import styles from './AuthPageFrame.module.css';

/**
 * Nền trang của các màn tài khoản đứng một mình — quên/đặt lại mật khẩu, đăng nhập/đăng ký của site
 * partner và site quản trị. Thẻ form căn giữa, bộ đổi ngôn ngữ neo góc trên (trang không có header
 * nào khác để đặt nó).
 */
export function AuthPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.localeCorner}>
        <LocaleSwitcher />
      </div>
      {children}
    </div>
  );
}
