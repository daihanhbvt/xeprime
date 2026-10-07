'use client';

import { useTranslations } from 'next-intl';

import { SectionCard } from '@/components/layout/SectionCard';
import { ACCOUNT_SECTION, accountSectionDomId } from '@/constants/routes';
import { ChangePasswordForm } from '@/features/auth/components/ChangePasswordForm';

import type { UserProfile } from '../types';
import { AccountDeletionImpact } from './AccountDeletionImpact';
import { DeleteAccountView } from './DeleteAccountView';
import { LoginMethods } from './LoginMethods';

/**
 * Ba section BẢO MẬT của một tài khoản partner — thông tin đăng nhập, mật khẩu, xoá tài khoản.
 *
 * Dùng chung bởi hai bản của trang `/manage/account` (ADR 0051 điều 3 — một URL, nội dung theo
 * tuyến): "Tài khoản & bảo mật" (`PartnerAccountPage`) và "Hồ sơ chủ xe" (`OwnerProfilePage`). Ba
 * khối này là việc của một CON NGƯỜI ở cả hai tuyến, nên chúng là một bản: luồng OTP, luật mật
 * khẩu và luồng yêu cầu xoá chỉ có một chỗ để sửa.
 *
 * Phải nằm trong một `Form` ngữ cảnh của trang (nhãn trên ô, không dấu hai chấm).
 */
export function AccountSecuritySections({ profile }: { profile: UserProfile }) {
  const t = useTranslations('Account.hub');

  return (
    <>
      <SectionCard
        id={accountSectionDomId(ACCOUNT_SECTION.LOGIN)}
        title={t('sections.login')}
        hint={t('sections.loginHint')}
      >
        <LoginMethods profile={profile} />
      </SectionCard>

      <SectionCard
        id={accountSectionDomId(ACCOUNT_SECTION.PASSWORD)}
        title={t('sections.password')}
        hint={t('sections.passwordHint')}
      >
        <ChangePasswordForm embedded />
      </SectionCard>

      <SectionCard
        id={accountSectionDomId(ACCOUNT_SECTION.DELETE)}
        title={t('sections.delete')}
        hint={t('sections.deleteHint')}
        tone="danger"
      >
        <DeleteAccountView embedded impact={<AccountDeletionImpact />} />
      </SectionCard>
    </>
  );
}
