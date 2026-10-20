'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { REGISTRATION_TRACK, isRegistrationTrack, type RegistrationTrack } from '@xeprime/types';

import { PartnerFocusLayout } from '@/components/layout/PartnerFocusLayout';
import {
  PARTNER_SIGNUP_SOURCE_MARKET,
  PARTNER_SIGNUP_SOURCE_PARAM,
  REGISTRATION_TRACK_PARAM,
  ROUTES,
  partnerSignupHref,
  partnerTrackStartHref,
} from '@/constants/routes';
import { ListYourVehicleLanding } from '@/features/list-vehicle/components/ListYourVehicleLanding';
import { ClientRedirect } from '@/features/partner/components/ClientRedirect';
import { PartnerSignupForm } from '@/features/shop/components/PartnerSignupForm';
import { useCurrentUser } from '@/hooks/use-current-user';
import { ZONE, siteHref } from '@/zones';

import { useAuthCache } from '../hooks/use-auth-actions';
import {
  AUTH_MODE,
  PARTNER_TRACK,
  isPartnerInvitePage,
  partnerSignupContinueHref,
  resolvePartnerTrack,
  type PanelAuthMode,
} from '../post-auth-destination';
import type { CurrentUser } from '@/services/auth.service';
import { AuthPanel } from './AuthPanel';
import { PORTAL_FOOT_LINK_CLASS, PortalLoginLayout } from './PortalLoginLayout';
import styles from './PartnerRegisterView.module.css';

/**
 * ĐĂNG KÝ SITE PARTNER — lối vào duy nhất của "Trở thành chủ xe" (ADR 0051 điều 3 · ADR 0053).
 *
 *  1. CHỌN TUYẾN TRƯỚC (chưa có `?track=`): "Gian hàng" hay "Chủ xe" — trang giới thiệu hai tuyến,
 *     cho cả người chưa đăng nhập lẫn tài khoản đối tác chưa có gian hàng.
 *  2. MỘT FORM cho tuyến đã chọn (`?track=`): tài khoản (nếu chưa có phiên) + hồ sơ của tuyến — họ
 *     tên, SĐT, email hỏi đúng một lần (`PartnerSignupForm`). Xong thì đi tiếp bước đầu của tuyến
 *     (`partnerTrackStartHref`): gói → chọn gói + thanh toán; hoa hồng → Tổng quan của khu quản lý.
 *  3. Đã có gian hàng: không còn gì để đăng ký — về trang chủ theo tuyến (bảng B1).
 *  4. `?next=` là một LỜI MỜI vào gian hàng: chỉ tạo TÀI KHOẢN rồi về đúng lời mời — người được mời
 *     tham gia gian hàng của người khác, không mở gian hàng của mình.
 *
 * `?track=` chỉ là ý định cho tới khi gian hàng được tạo; nguồn thật là `tenants.onboarding_state`
 * (ADR 0040 điều 1), gửi lên bằng `registrationTrack`.
 */
export function PartnerRegisterView() {
  const t = useTranslations('Auth.partnerRegister');
  const tSignup = useTranslations('ShopOnboarding.signup');
  const router = useRouter();
  const search = useSearchParams();
  const { refreshAfterAuth } = useAuthCache();
  const { data: user, isLoading, dataUpdatedAt, errorUpdatedAt } = useCurrentUser();
  const [mode, setMode] = useState<PanelAuthMode>(AUTH_MODE.REGISTER);
  /** Đích sau khi form vừa tạo gian hàng — thắng phép suy "đã có gian hàng ⇒ về trang chủ". */
  const [doneHref, setDoneHref] = useState<string | null>(null);

  const rawTrack = search.get(REGISTRATION_TRACK_PARAM);
  const chosenTrack: RegistrationTrack | null = isRegistrationTrack(rawTrack) ? rawTrack : null;
  const rawNext = search.get('next');
  const inviteNext = isPartnerInvitePage(rawNext) ? rawNext : null;
  /** Tới từ site khách (đã chọn tuyến ở đó, tab mới) ⇒ không mời đổi tuyến. */
  const fromMarket = search.get(PARTNER_SIGNUP_SOURCE_PARAM) === PARTNER_SIGNUP_SOURCE_MARKET;

  if (doneHref) return <ClientRedirect href={doneHref} />;
  /*
   * Spinner CHỈ ở lần nạp ĐẦU TIÊN (`/auth/me` chưa từng trả lời, kể cả bằng 401). Lượt hỏi lại sau
   * một 401 đưa query về `pending` (chưa có data) ⇒ `isLoading` bật lại; nếu nhánh đó dựng spinner thì
   * cây con (layout + form, mỗi cái một observer `useCurrentUser`) bị tháo rồi mount lại, observer mới
   * hỏi lại, query lại `pending`… — đúng vòng `GET /auth/me` vô tận cho người chưa đăng nhập. Một khi
   * đã có câu trả lời (thành công hay 401) thì giữ nguyên cây, để lượt làm mới chạy ngầm.
   */
  const answeredOnce = dataUpdatedAt > 0 || errorUpdatedAt > 0;
  if (isLoading && !user && !answeredOnce) return <Spin fullscreen />;

  if (user) {
    if (inviteNext) return <ClientRedirect href={inviteNext} />;
    if (resolvePartnerTrack(user) !== PARTNER_TRACK.NONE) {
      return <ClientRedirect href={partnerSignupContinueHref(user, chosenTrack)} />;
    }
  } else if (inviteNext) {
    const finishInvite = async (authenticated: CurrentUser) => {
      await refreshAfterAuth(authenticated);
      router.replace(inviteNext);
    };
    return (
      <PortalLoginLayout
        asideText={t('asideText')}
        title={mode === AUTH_MODE.REGISTER ? t('title') : t('loginTitle')}
        subtitle={t('subtitle')}
        footer={
          <a href={siteHref(ZONE.MARKET, ROUTES.HOME)} className={PORTAL_FOOT_LINK_CLASS}>
            <ArrowLeftOutlined /> {t('backToMarket')}
          </a>
        }
      >
        <AuthPanel mode={mode} onModeChange={setMode} onAuthenticated={finishInvite} />
      </PortalLoginLayout>
    );
  }

  if (!chosenTrack) {
    return (
      <PartnerFocusLayout>
        <ListYourVehicleLanding
          personalHref={partnerSignupHref(REGISTRATION_TRACK.COMMISSION)}
          shopHref={partnerSignupHref(REGISTRATION_TRACK.PACKAGE)}
          showBack={false}
        />
        {user ? null : <LoginHint label={tSignup('hasAccount')} action={tSignup('login')} />}
      </PartnerFocusLayout>
    );
  }

  /*
   * CÙNG một cây cho người chưa đăng nhập và người vừa được cấp phiên ở bước 1 của form — dựng hai
   * cây là tháo form đúng lúc tài khoản vừa tạo, và mọi giá trị đã gõ mất sạch.
   */
  return (
    <PartnerFocusLayout>
      <div className={styles.wrap}>
        {fromMarket ? null : (
          <Link href={ROUTES.MANAGE.REGISTER} className={styles.back}>
            <ArrowLeftOutlined /> {tSignup('changeTrack')}
          </Link>
        )}
        <PartnerSignupForm
          track={chosenTrack}
          onCreated={(track) => setDoneHref(partnerTrackStartHref(track))}
        />
        {user ? null : <LoginHint label={tSignup('hasAccount')} action={tSignup('login')} />}
      </div>
    </PartnerFocusLayout>
  );
}

function LoginHint({ label, action }: { label: string; action: string }) {
  return (
    <p className={styles.loginHint}>
      {label} <Link href={ROUTES.MANAGE.LOGIN}>{action}</Link>
    </p>
  );
}
