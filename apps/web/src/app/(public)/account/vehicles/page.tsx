import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { AccountVehiclesView } from '@/features/account/components/AccountVehiclesView';
import { OwnerGate } from '@/features/account/components/OwnerGate';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('vehicles'), robots: { index: false, follow: false } };
}

/**
 * Danh sách xe của chủ xe — cùng feature `vehicles` với `/manage/vehicles`, vỏ `/account`.
 *
 * `OwnerGate` đứng NGOÀI: người không phải chủ gian hàng không render `AccountVehiclesView`, tức
 * không gọi `/vehicles` để rồi 403. `Suspense` là bắt buộc vì bộ lọc đọc `useSearchParams`.
 */
export default function AccountVehiclesPage() {
  return (
    <OwnerGate>
      <Suspense fallback={<LoadingState variant="cards" />}>
        <AccountVehiclesView />
      </Suspense>
    </OwnerGate>
  );
}
