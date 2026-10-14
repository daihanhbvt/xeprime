import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ROUTES } from '@/constants/routes';
import { AccountPhoneGate } from '@/features/auth/components/AccountPhoneGate';
import { ZONE } from '@/zones';
import { ZoneProvider } from '@/zones/ZoneProvider';

/**
 * Gốc SITE PARTNER (`partner.xeprime.vn` — ADR 0051 điều 2). `ZoneProvider` là nguồn duy nhất cho
 * câu "trang này thuộc khu nào" — không suy từ tiền tố đường dẫn.
 *
 * `AccountPhoneGate` nằm NGOÀI `AppShell` để phủ cả các trang công khai của site (đăng ký, đăng
 * nhập): tài khoản đối tác vừa tạo bằng Google/Facebook phải xác minh SĐT trước khi chọn tuyến
 * cho thuê — ADR 0060.
 */
export default function ManageLayout({ children }: { children: ReactNode }) {
  return (
    <ZoneProvider zone={ZONE.PARTNER}>
      <AppShell>{children}</AppShell>
      <AccountPhoneGate signOutTo={ROUTES.MANAGE.LOGIN} />
    </ZoneProvider>
  );
}
