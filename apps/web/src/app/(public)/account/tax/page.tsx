import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OwnerGate } from '@/features/account/components/OwnerGate';
import { SellerTaxCompactForm } from '@/features/seller-profile/components/SellerTaxCompactForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('tax'), robots: { index: false, follow: false } };
}

/**
 * Thông tin khai thuế — bản compact của hồ sơ người bán (`/seller-profile`, tenant-scoped).
 * `OwnerGate` chặn trước khi form gọi API cho người không phải chủ gian hàng.
 */
export default function AccountTaxPage() {
  return (
    <OwnerGate>
      <SellerTaxCompactForm />
    </OwnerGate>
  );
}
