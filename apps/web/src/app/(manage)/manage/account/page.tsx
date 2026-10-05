import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PartnerAccountPage } from '@/features/account/components/PartnerAccountPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Account.hub');
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * TÀI KHOẢN & BẢO MẬT của tài khoản đối tác — hồ sơ, thông tin đăng nhập, mật khẩu, xoá tài khoản.
 *
 * Gộp từ hai trang (05/10/2026): hồ sơ cá nhân ở đây và "Bảo mật tài khoản" ở `/manage/security`
 * (nay là redirect). Thân trang ở `PartnerAccountPage`.
 */
export default function PartnerAccountRoute() {
  return <PartnerAccountPage />;
}
