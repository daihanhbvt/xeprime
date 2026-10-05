import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { DataProtectionView } from '@/features/account/components/DataProtectionView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('dataProtection'), robots: { index: false, follow: false } };
}

/** Tóm tắt chính sách bảo vệ dữ liệu — dẫn tới văn bản thật ở `/legal/privacy`. */
export default function DataProtectionPage() {
  return <DataProtectionView />;
}
