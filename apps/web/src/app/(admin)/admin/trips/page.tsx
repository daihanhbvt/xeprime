'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { LoadingState } from '@/components/feedback/LoadingState';
import { TripOpsView } from '@/features/admin-trips/components/TripOpsView';

function PageFallback() {
  const t = useTranslations('AdminTrips.page');
  return <LoadingState variant="page" label={t('loading')} />;
}

/** Vận hành chuyến — `useSearchParams` bên trong đòi một ranh giới Suspense ở trang. */
export default function AdminTripsPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <TripOpsView />
    </Suspense>
  );
}
