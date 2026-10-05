import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ContractsDocumentsView } from '@/features/account/components/ContractsDocumentsView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('contractsDocuments'), robots: { index: false, follow: false } };
}

/** Thư viện biểu mẫu PDF — nội dung tĩnh, Server Component; không gọi API tenant. */
export default function ContractsDocumentsPage() {
  return <ContractsDocumentsView />;
}
