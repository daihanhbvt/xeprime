import type { ReactNode } from 'react';
import { AccountShell } from '@/features/account/components/AccountShell';

/**
 * Vỏ khu tài khoản — menu + cổng đăng nhập đặt một lần cho MỌI trang con.
 *
 * Layout là Server Component; `AccountShell` là client island vì nó đọc "tôi là ai" và đường
 * dẫn hiện tại. Đặt cổng đăng nhập ở đây, không ở từng trang: chín trang tự gác cửa là chín
 * bản sao của một luồng bảo mật, chỉ cần một trang quên là lộ khung cho người chưa đăng nhập.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
