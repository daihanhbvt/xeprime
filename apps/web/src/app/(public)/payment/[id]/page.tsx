'use client';

import { Skeleton } from 'antd';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { CustomerAuthGate } from '@/features/account/components/CustomerAuthGate';
import { TripPaymentView } from '@/features/trips/components/TripPaymentView';

/**
 * Trang thanh toán tiền giữ chỗ — `xeprime.vn/payment/:tripId`.
 *
 * Cần phiên KHÁCH nhưng không mang menu tài khoản: đây là màn một việc. `Suspense` vì thân trang
 * đọc `useSearchParams` (lượt quay về từ cổng). Không metadata/SEO — dữ liệu cá nhân, như `/trips/:id`.
 */
export default function PaymentPage() {
  const params = useParams<{ id: string }>();
  const tripId = params?.id ?? '';
  return (
    <CustomerAuthGate>
      {() => (
        <Suspense fallback={<Skeleton active paragraph={{ rows: 8 }} />}>
          <TripPaymentView tripId={tripId} />
        </Suspense>
      )}
    </CustomerAuthGate>
  );
}
