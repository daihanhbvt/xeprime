import { Suspense } from 'react';
import type { Metadata } from 'next';
import { TripsView } from '@/features/trips/components/TripsView';

export const metadata: Metadata = {
  title: 'Chuyến của tôi',
};

/**
 * Khu khách hàng — danh sách chuyến. Dữ liệu cá nhân nên không cần SEO; client island.
 *
 * `Suspense` là bắt buộc: `TripsView` đọc `useSearchParams` (tab + trang sống ở URL, ADR 0004),
 * và Next bắt mọi cây có nó phải nằm trong một ranh giới Suspense.
 */
export default function TripsPage() {
  return (
    <Suspense fallback={null}>
      <TripsView />
    </Suspense>
  );
}
