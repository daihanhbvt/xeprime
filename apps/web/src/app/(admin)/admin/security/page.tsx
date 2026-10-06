import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ChangePasswordForm } from '@/features/auth/components/ChangePasswordForm';

import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.manage');
  return { title: t('security'), robots: { index: false, follow: false } };
}

/**
 * Bảo mật tài khoản của NHÂN SỰ NỀN TẢNG — chỉ đổi mật khẩu.
 *
 * Không có "phương thức đăng nhập" (realm `platform` chỉ đăng nhập bằng mật khẩu — ADR 0053 điều 3)
 * và không có "yêu cầu xoá tài khoản": nhân sự rời đội ngũ do quản trị viên gỡ ở "Nhân sự nền tảng",
 * có audit — không phải một yêu cầu hỗ trợ tự gửi.
 */
export default async function AdminSecurityPage() {
  const t = await getTranslations('Account.security');

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className={styles.stack}>
        <ChangePasswordForm headingLevel="h2" />
      </div>
    </div>
  );
}
