'use client';

import { DeleteOutlined } from '@ant-design/icons';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SUPPORT_CASE_STATUS_META, type SupportCaseStatus } from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { ACCOUNT_DELETION_OPEN, ACCOUNT_DELETION_PARAM } from '@/constants/routes';
import { ChangePasswordForm } from '@/features/auth/components/ChangePasswordForm';

import { useAccountDeletionRequest } from '../hooks/use-account-deletion';
import { AccountDeletionDialog } from './AccountDeletionDialog';
import { AccountPanel } from './AccountPanel';
import styles from './AccountSecurityView.module.css';

/**
 * "Bảo mật tài khoản" — SITE KHÁCH (design Account / Security, Figma `19973:54991`): MỘT mục menu
 * gộp đổi mật khẩu và yêu cầu xoá tài khoản.
 *
 *  - Thẻ chính: đổi mật khẩu (hoặc đặt lần đầu với tài khoản OTP/social) + bảng yêu cầu mật khẩu.
 *  - Dưới thẻ: lối "Yêu cầu xoá tài khoản" mở `AccountDeletionDialog`. Việc một lần và khó lùi lại
 *    nên nó là một dòng chữ đỏ ngoài thẻ, không phải form phơi giữa trang.
 *
 * Hộp xoá mở/đóng theo URL (`?deletion=open`): đường cũ `/account/delete-account` và link "xoá
 * tài khoản" công khai trỏ thẳng vào hộp, F5 không làm mất nó.
 */
export function AccountSecurityView() {
  const t = useTranslations('Account.security');
  const tDelete = useTranslations('Account.deleteAccount');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pending } = useAccountDeletionRequest();

  const deletionOpen = searchParams.get(ACCOUNT_DELETION_PARAM) === ACCOUNT_DELETION_OPEN;
  const setDeletionOpen = (open: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (open) params.set(ACCOUNT_DELETION_PARAM, ACCOUNT_DELETION_OPEN);
    else params.delete(ACCOUNT_DELETION_PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className={styles.stack}>
      {/* h1: vỏ `AccountShell` không mang h1 — mục là nội dung chính của trang. */}
      <AccountPanel
        as="h1"
        title={t('title')}
        subtitle={t('customerSubtitle')}
        titleSize="lg"
        spacious
        className={styles.panel}
      >
        <ChangePasswordForm appearance="account" />
      </AccountPanel>

      <div className={styles.deletion}>
        <button
          type="button"
          className={styles.deletionLink}
          onClick={() => setDeletionOpen(true)}
          aria-haspopup="dialog"
        >
          <DeleteOutlined aria-hidden="true" />
          <span>{tDelete('title')}</span>
        </button>
        {pending ? (
          <StatusTag
            value={pending.status as SupportCaseStatus}
            meta={SUPPORT_CASE_STATUS_META}
            group="supportCaseStatus"
          />
        ) : null}
      </div>

      <AccountDeletionDialog open={deletionOpen} onClose={() => setDeletionOpen(false)} />
    </div>
  );
}
