import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DriverLicencePage } from '@/features/driver-licence/components/DriverLicencePage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('documents'), robots: { index: false, follow: false } };
}

/**
 * Giấy tờ & Xác minh — bằng lái của tài khoản khách (ADR 0057). Bước "Xác thực bằng lái" trong
 * luồng đặt xe tự lái dùng cùng bộ xác thực này, nên nộp ở đâu thì chỗ kia cũng thấy.
 */
export default function AccountDocumentsPage() {
  return <DriverLicencePage />;
}
