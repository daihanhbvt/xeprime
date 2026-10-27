import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { AccountSecurityView } from '@/features/account/components/AccountSecurityView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('security'), robots: { index: false, follow: false } };
}

/**
 * "Bảo mật tài khoản" — đổi mật khẩu (hoặc đặt lần đầu với tài khoản OTP/social) và lối gửi YÊU
 * CẦU xoá tài khoản (support case, nền tảng xử lý tay). Cổng đăng nhập ở `AccountShell`.
 *
 * `Suspense`: trang đọc `?deletion=open` bằng `useSearchParams`.
 */
export default function AccountSecurityPage() {
  return (
    <Suspense>
      <AccountSecurityView />
    </Suspense>
  );
}
