import type { ReactNode } from 'react';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import styles from './auth-layout.module.css';

/**
 * Vỏ của các trang xác thực ĐỘC LẬP (quên/đặt lại mật khẩu) — không có header marketplace,
 * không có topbar cổng quản lý.
 *
 * Vì thế bộ đổi ngôn ngữ phải có mặt NGAY TẠI ĐÂY, ở góc trên bên phải: đây là những trang mà
 * người dùng tới từ một liên kết trong email, thường là chưa đăng nhập, và không có bề mặt nào
 * khác để đổi ngôn ngữ.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.localeCorner}>
        <LocaleSwitcher />
      </div>
      {children}
    </div>
  );
}
