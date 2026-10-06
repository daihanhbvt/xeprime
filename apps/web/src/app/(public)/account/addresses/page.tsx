import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AccountComingSoon } from '@/features/account/components/AccountComingSoon';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('addresses'), robots: { index: false, follow: false } };
}

/** Route giữ chỗ, chưa có link menu và chưa có nội dung — xem `docs/design/03_PRODUCT_GAP_ANALYSIS.md` §6. */
export default function AccountPlaceholderPage() {
  return <AccountComingSoon labelKey="addresses" />;
}
