import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DriverCenterPage } from '@/features/driving/components/DriverCenterPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('driving'), robots: { index: false, follow: false } };
}

/** "Trung tâm Tài xế" — chuyến được gán + chủ xe đối tác của tài khoản khách (ADR 0063). */
export default function AccountDrivingPage() {
  return <DriverCenterPage />;
}
