'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { useIsMobile } from '@/hooks/use-media-query';
import { MarketForgotPassword } from './MarketForgotPassword';
import { PortalAuthFrame } from './PortalAuthFrame';
import marketStyles from './MarketAuth.module.css';

/**
 * Quên mật khẩu site PARTNER — cùng ba bước design v2 với hộp tài khoản site khách
 * (`MarketForgotPassword`: SĐT → mã OTP → mật khẩu mới), cùng endpoint `password_reset`. Realm do
 * host quyết (ADR 0053), nên mã và mật khẩu mới chỉ chạm tài khoản ĐỐI TÁC. Đặt lại KHÔNG cấp phiên
 * (ADR 0060 §4) — xong thì về trang đăng nhập partner.
 */
export function PartnerForgotPasswordView() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const isMobile = useIsMobile();
  const otp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET);
  const [sentTo, setSentTo] = useState<string | null>(null);

  return (
    <PortalAuthFrame
      topLink={
        <Link href={ROUTES.MANAGE.LOGIN} className={marketStyles.footerLink}>
          <ArrowLeftOutlined /> {t('links.backToLogin')}
        </Link>
      }
    >
      <MarketForgotPassword
        defaultPhone=""
        otp={otp}
        sentTo={sentTo}
        onCodeSent={setSentTo}
        autoFocus={!isMobile}
        hideProgress
        onBackToLogin={() => router.push(ROUTES.MANAGE.LOGIN)}
      />
    </PortalAuthFrame>
  );
}
