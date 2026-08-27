import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AccountComingSoon } from '@/features/account/components/AccountComingSoon';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('settings'), robots: { index: false, follow: false } };
}

/** Mục đã có chỗ trong menu, nội dung dựng ở wave sau — xem `docs/plans/2026-08-21-*`. */
export default function AccountPlaceholderPage() {
  return <AccountComingSoon labelKey="settings" />;
}
