import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AccountLookupView } from '@/features/admin-accounts/components/AccountLookupView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AdminAccounts');
  return { title: t('page.title') };
}

/** Tra cứu xuyên realm theo SĐT/email — ADR 0053 điều 9. Định danh ở URL ⇒ cần ranh giới Suspense. */
export default function AdminAccountsPage() {
  return (
    <Suspense>
      <AccountLookupView />
    </Suspense>
  );
}
