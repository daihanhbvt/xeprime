'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect } from 'react';
import { ROUTES } from '@/constants/routes';
import { AUTH_ERROR_PARAM } from '@/features/auth/components/AuthModalProvider';
import { MarketAuthForms } from '@/features/auth/components/MarketAuthForms';
import { PortalAuthFrame } from '@/features/auth/components/PortalAuthFrame';
import marketStyles from '@/features/auth/components/MarketAuth.module.css';
import { useAuthCache } from '@/features/auth/hooks/use-auth-actions';
import {
  AUTH_INTENT,
  AUTH_MODE,
  resolvePartnerDestination,
} from '@/features/auth/post-auth-destination';
import { useCurrentUser, type CurrentUser } from '@/hooks/use-current-user';
import { useIsMobile } from '@/hooks/use-media-query';
import { ZONE, siteHref } from '@/zones';

/**
 * Đăng nhập SITE PARTNER — gian hàng tuyến gói, nhân viên gian hàng và chủ xe tuyến hoa hồng
 * (ADR 0051 điều 3). Đăng nhập ở đây là đăng nhập TÀI KHOẢN ĐỐI TÁC (realm `partner`): cùng số điện
 * thoại với tài khoản khách vẫn là hai tài khoản, hai mật khẩu (ADR 0053).
 *
 * Route CÔNG KHAI (`AppShell` và proxy bỏ qua cổng phiên cho nó) — nếu không thì chưa đăng nhập sẽ
 * bị đá về chính nó.
 */
export default function PartnerLoginPage() {
  return (
    <Suspense fallback={null}>
      <PartnerLoginView />
    </Suspense>
  );
}

function PartnerLoginView() {
  const t = useTranslations('Auth.portal');
  const tAuth = useTranslations('Auth');
  const router = useRouter();
  const search = useSearchParams();
  const { refreshAfterAuth } = useAuthCache();
  const { data: user } = useCurrentUser();
  const isMobile = useIsMobile();

  const next = search.get('next');
  const isOwnerIntent = search.get('intent') === AUTH_INTENT.OWNER;
  // Đăng nhập Google/Facebook RỜI TRANG rồi quay lại (ADR 0019): lỗi của nó về đây trong URL.
  const authError = search.get(AUTH_ERROR_PARAM);

  /*
   * ĐÃ đăng nhập mà mở thẳng URL này → đưa về đúng chỗ, đừng hiện form. Làm ở ĐÂY chứ không ở
   * proxy: proxy chỉ thấy cookie CÓ hay KHÔNG, không verify được; còn ở đây căn cứ là `/auth/me`
   * đã xác thực THẬT — không thể lặp.
   */
  useEffect(() => {
    if (!user) return;
    router.replace(resolvePartnerDestination({ user, next }));
  }, [user, next, router]);

  if (user) return <Spin fullscreen />;

  async function handleAuthenticated(authenticated: CurrentUser) {
    // Điều hướng theo TUYẾN THẬT lấy từ `/auth/me` sau khi làm mới cache — không đoán từ form.
    const fresh = (await refreshAfterAuth(authenticated)) ?? authenticated;
    router.replace(resolvePartnerDestination({ user: fresh, next }));
  }

  return (
    <PortalAuthFrame>
      <MarketAuthForms
        mode={AUTH_MODE.LOGIN}
        partnerLogin
        heading={{ title: tAuth('market.login.title'), sub: t('subtitle') }}
        note={isOwnerIntent ? t('ownerIntent') : undefined}
        // "Đăng ký ngay!" của site partner là trang đăng ký đối tác (chọn tuyến).
        onModeChange={() => router.push(ROUTES.MANAGE.REGISTER)}
        onForgot={() => router.push(ROUTES.MANAGE.FORGOT_PASSWORD)}
        onAuthenticated={handleAuthenticated}
        initialErrorCode={authError}
        forBooking={false}
        autoFocus={!isMobile}
        footer={
          /* Site khách là site KHÁC (ADR 0051) — URL tuyệt đối ở chế độ `host`. */
          <a href={siteHref(ZONE.MARKET, ROUTES.HOME)} className={marketStyles.footerLink}>
            <ArrowLeftOutlined /> {t('backToSearch')}
          </a>
        }
      />
    </PortalAuthFrame>
  );
}
