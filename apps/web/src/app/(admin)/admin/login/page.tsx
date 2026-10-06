'use client';

import { Spin } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect } from 'react';
import { AuthPanel } from '@/features/auth/components/AuthPanel';
import { PortalLoginLayout } from '@/features/auth/components/PortalLoginLayout';
import { useAuthCache } from '@/features/auth/hooks/use-auth-actions';
import { AUTH_MODE, resolveAdminDestination } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';

/**
 * Đăng nhập SITE QUẢN TRỊ — nhân sự nền tảng (realm `platform`, ADR 0053 điều 3).
 *
 * CHỈ email/SĐT + mật khẩu: không tự đăng ký (tài khoản do quản trị viên tạo ở "Nhân sự nền tảng"),
 * không OTP, không Google/Facebook — API cũng từ chối các đường đó cho realm này. Không có link sang
 * site khác: nhân sự đăng nhập ở đây để làm việc quản trị, không phải để mua bán.
 */
export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginView />
    </Suspense>
  );
}

function AdminLoginView() {
  const t = useTranslations('Auth.adminPortal');
  const router = useRouter();
  const next = useSearchParams().get('next');
  const { refreshAfterAuth } = useAuthCache();
  const { data: user } = useCurrentUser();

  // Đã đăng nhập (phiên đã được `/auth/me` xác thực) → vào khu quản trị, không hiện form chết.
  useEffect(() => {
    if (!user) return;
    router.replace(resolveAdminDestination({ next }));
  }, [user, next, router]);

  if (user) return <Spin fullscreen />;

  return (
    <PortalLoginLayout asideText={t('asideText')} title={t('title')} subtitle={t('subtitle')}>
      <AuthPanel
        mode={AUTH_MODE.LOGIN}
        passwordOnly
        onAuthenticated={async (authenticated) => {
          await refreshAfterAuth(authenticated);
          router.replace(resolveAdminDestination({ next }));
        }}
      />
    </PortalLoginLayout>
  );
}
