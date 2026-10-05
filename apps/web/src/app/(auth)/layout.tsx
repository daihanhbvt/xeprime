import type { ReactNode } from 'react';
import { AuthPageFrame } from '@/features/auth/components/AuthPageFrame';
import { ZONE } from '@/zones';
import { ZoneProvider } from '@/zones/ZoneProvider';

/**
 * Quên/đặt lại mật khẩu của tài khoản KHÁCH — trang của site khách (ADR 0053: mỗi site một không gian
 * tài khoản; site partner và site quản trị có trang riêng của mình).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <ZoneProvider zone={ZONE.MARKET}>
      <AuthPageFrame>{children}</AuthPageFrame>
    </ZoneProvider>
  );
}
