import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DriverLinksPage } from '@/features/driving/components/DriverLinksPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('driving'), robots: { index: false, follow: false } };
}

/** "Nơi tôi làm tài xế" — lời mời + liên kết tài xế của tài khoản khách (ADR 0063). */
export default function AccountDrivingPage() {
  return <DriverLinksPage />;
}
