'use client';

import { useTranslations } from 'next-intl';
import { ACCOUNT_DOCUMENTS_ANCHOR } from '@/constants/routes';
import { AccountPanel } from '@/features/account/components/AccountPanel';
import { DriverLicenceVerifier } from './DriverLicenceVerifier';

/**
 * Mục "Giấy tờ & Xác minh" ngay trong trang Quản lý tài khoản (theo design Account / Profile) —
 * thay cho trang riêng `/account/documents` trước đây, giờ chỉ còn chuyển tiếp về đây. Bước bằng lái
 * trong luồng đặt xe dùng CÙNG bộ xác thực, nên nộp ở đâu thì chỗ kia cũng thấy (ADR 0057).
 */
export function AccountDocumentsCard() {
  const t = useTranslations('DriverLicence.page');
  const tn = useTranslations('Navigation.account');
  return (
    <AccountPanel
      id={ACCOUNT_DOCUMENTS_ANCHOR}
      title={tn('documents')}
      subtitle={t('subtitle')}
      spacious
    >
      <DriverLicenceVerifier embedded />
    </AccountPanel>
  );
}
