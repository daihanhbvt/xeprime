import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AccountView } from '@/features/account/components/AccountView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('personalProfile'), robots: { index: false, follow: false } };
}

/**
 * HỒ SƠ CÁ NHÂN của tài khoản đối tác — tên, ảnh, SĐT, email.
 *
 * Trước ADR 0053 trang này chỉ là lối chuyển sang `/manage/security`, vì tên/ảnh "thuộc tài khoản
 * marketplace". Nay tài khoản partner là một tài khoản RIÊNG (realm `partner`), nên nó có hồ sơ của
 * nó ngay trên site của nó — cùng `AccountView` với khu khách, khác dữ liệu vì khác tài khoản.
 */
export default function PartnerAccountPage() {
  return <AccountView />;
}
