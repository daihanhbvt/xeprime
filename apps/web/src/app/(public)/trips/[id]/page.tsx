'use client';

import { useParams } from 'next/navigation';
import { CustomerAuthGate } from '@/features/account/components/CustomerAuthGate';
import { TripDetailView } from '@/features/trips/components/TripDetailView';

/**
 * Chi tiết một chuyến của khách.
 *
 * Màn hình độc lập không mang menu tài khoản bên trái (theo đúng thiết kế Figma v2):
 * nội dung hiển thị rộng đầy đủ theo layout 2 cột. Được bảo vệ bởi CustomerAuthGate.
 */
export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <CustomerAuthGate>
      {() => <TripDetailView tripId={params?.id ?? ''} />}
    </CustomerAuthGate>
  );
}
