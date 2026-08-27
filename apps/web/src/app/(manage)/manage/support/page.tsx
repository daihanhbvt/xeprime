import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SupportCenter } from '@/features/support/components/SupportCenter';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ManageCommon');
  return {
    title: t('support.title'),
    // Nội dung của cổng quản lý — không có gì để index.
    robots: { index: false, follow: false },
  };
}

export default function SupportPage() {
  return <SupportCenter />;
}
