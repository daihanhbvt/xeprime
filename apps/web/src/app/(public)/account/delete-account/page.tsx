import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { DeleteAccountView } from '@/features/account/components/DeleteAccountView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('deleteAccount'), robots: { index: false, follow: false } };
}

/** YÊU CẦU xoá tài khoản — mở support case `account_deletion`, nền tảng xử lý tay. */
export default function DeleteAccountPage() {
  return <DeleteAccountView />;
}
