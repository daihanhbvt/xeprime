import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { HostGuideView } from '@/features/account/components/HostGuideView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('hostGuide'), robots: { index: false, follow: false } };
}

/** Cẩm nang cho thuê xe — nội dung tĩnh, Server Component; không gọi API tenant. */
export default function HostGuidePage() {
  return <HostGuideView />;
}
