import type { Metadata } from 'next';
import { AccountView } from '@/features/account/components/AccountView';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.public');
  return {
    title: t('accountMine'),
    // Hồ sơ cá nhân — không có gì để index, và không nên xuất hiện trên công cụ tìm kiếm.
    robots: { index: false, follow: false },
  };
}

/**
 * Hồ sơ của CON NGƯỜI đang đăng nhập — chủ xe, chủ gian hàng và khách thuê dùng CHUNG trang
 * này (ADR 0014). Vỏ (menu, cổng đăng nhập, tiêu đề) nằm ở `layout.tsx`.
 */
export default function AccountPage() {
  return <AccountView />;
}
