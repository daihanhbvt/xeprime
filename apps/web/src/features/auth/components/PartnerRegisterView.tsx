'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { REGISTRATION_TRACK, isRegistrationTrack, type RegistrationTrack } from '@xeprime/types';

import { PartnerFocusLayout } from '@/components/layout/PartnerFocusLayout';
import { REGISTRATION_TRACK_PARAM, ROUTES, partnerTrackStartHref } from '@/constants/routes';
import { ListYourVehicleLanding } from '@/features/list-vehicle/components/ListYourVehicleLanding';
import { ClientRedirect } from '@/features/partner/components/ClientRedirect';
import { useCurrentUser, type CurrentUser } from '@/hooks/use-current-user';
import { ZONE, siteHref } from '@/zones';

import { useAuthCache } from '../hooks/use-auth-actions';
import {
  AUTH_MODE,
  PARTNER_TRACK,
  isPartnerInvitePage,
  partnerHomeHref,
  resolvePartnerTrack,
  type AuthMode,
} from '../post-auth-destination';
import { AuthPanel } from './AuthPanel';
import { PORTAL_FOOT_LINK_CLASS, PortalLoginLayout } from './PortalLoginLayout';

/**
 * ĐĂNG KÝ SITE PARTNER — lối vào duy nhất của "Trở thành chủ xe" (ADR 0051 điều 3 · ADR 0053).
 *
 *  1. Chưa đăng nhập: form tạo TÀI KHOẢN ĐỐI TÁC (realm `partner` — khác tài khoản khách dù cùng số
 *     điện thoại), chuyển được sang đăng nhập nếu đã có tài khoản.
 *  2. Đã đăng nhập, CHƯA có gian hàng: trang "Bắt đầu cho thuê xe theo cách phù hợp với bạn" — CHÍNH
 *     trang giới thiệu hai tuyến của site khách, nút dẫn vào bước đầu của tuyến
 *     (`partnerTrackStartHref`): hoa hồng → wizard đăng xe nhanh · gói → onboarding gói.
 *     `?track=` trên URL (người đã chọn ở landing công khai) bỏ qua trang này, vào thẳng bước đó.
 *  3. Đã có gian hàng: không còn gì để đăng ký — về trang chủ theo tuyến (bảng B1).
 *  4. `?next=` là một LỜI MỜI vào gian hàng: tạo tài khoản xong về đúng lời mời — người được mời
 *     tham gia gian hàng của người khác, không mở gian hàng của mình.
 *
 * Tuyến chỉ là ý định cho tới khi gian hàng được tạo; nguồn thật là `tenants.onboarding_state`
 * (ADR 0040 điều 1), nên F5 ở bất kỳ bước nào cũng rơi đúng chỗ.
 */
export function PartnerRegisterView() {
  const t = useTranslations('Auth.partnerRegister');
  const router = useRouter();
  const search = useSearchParams();
  const { refreshAfterAuth } = useAuthCache();
  const { data: user, isLoading } = useCurrentUser();
  const [mode, setMode] = useState<AuthMode>(AUTH_MODE.REGISTER);

  const rawTrack = search.get(REGISTRATION_TRACK_PARAM);
  const chosenTrack: RegistrationTrack | null = isRegistrationTrack(rawTrack) ? rawTrack : null;
  const rawNext = search.get('next');
  const inviteNext = isPartnerInvitePage(rawNext) ? rawNext : null;

  if (isLoading) return <Spin fullscreen />;

  if (user) {
    if (inviteNext) return <ClientRedirect href={inviteNext} />;
    if (resolvePartnerTrack(user) !== PARTNER_TRACK.NONE) {
      return <ClientRedirect href={partnerHomeHref(user)} />;
    }
    if (chosenTrack) return <ClientRedirect href={partnerTrackStartHref(chosenTrack)} />;
    return (
      <PartnerFocusLayout>
        <ListYourVehicleLanding
          personalHref={partnerTrackStartHref(REGISTRATION_TRACK.COMMISSION)}
          shopHref={partnerTrackStartHref(REGISTRATION_TRACK.PACKAGE)}
          showBack={false}
        />
      </PartnerFocusLayout>
    );
  }

  async function handleAuthenticated(authenticated: CurrentUser) {
    const fresh = (await refreshAfterAuth(authenticated)) ?? authenticated;
    if (inviteNext) {
      router.replace(inviteNext);
      return;
    }
    // Đăng nhập bằng một tài khoản ĐÃ có gian hàng thì về trang chủ của họ; còn lại ở trang này —
    // lần render sau (đã có `user`) tự sang trang chọn cách cho thuê, hoặc bước đầu của `?track=`.
    if (resolvePartnerTrack(fresh) !== PARTNER_TRACK.NONE) router.replace(partnerHomeHref(fresh));
  }

  return (
    <PortalLoginLayout
      asideText={t('asideText')}
      title={mode === AUTH_MODE.REGISTER ? t('title') : t('loginTitle')}
      subtitle={t('subtitle')}
      note={chosenTrack ? t(`chosen.${chosenTrack}`) : undefined}
      footer={
        <a href={siteHref(ZONE.MARKET, ROUTES.HOME)} className={PORTAL_FOOT_LINK_CLASS}>
          <ArrowLeftOutlined /> {t('backToMarket')}
        </a>
      }
    >
      <AuthPanel mode={mode} onModeChange={setMode} onAuthenticated={handleAuthenticated} />
    </PortalLoginLayout>
  );
}
