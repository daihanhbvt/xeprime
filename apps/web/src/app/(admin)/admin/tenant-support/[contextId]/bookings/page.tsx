import { redirect } from 'next/navigation';
import { SUPPORT_CAPABILITY } from '@xeprime/types';
import { Suspense } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { adminTenantSupportPath } from '@/constants/routes';
import { BookingsListView } from '@/features/bookings/components/BookingsListView';
import { legacyEndedBookingsTarget } from '@/features/bookings/rentals-redirect';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/**
 * "Đơn thuê xe" trong phiên hỗ trợ — CHÍNH `BookingsListView` (gộp yêu cầu + đơn, 05/11/2026). Mở
 * khi phiên có MỘT trong hai capability đọc; nhóm của thực thể thiếu quyền tự vắng.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ contextId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const root = adminTenantSupportPath.root((await params).contextId);
  const target = legacyEndedBookingsTarget(await searchParams, {
    bookings: `${root}/bookings`,
    ended: `${root}/bookings/ended`,
  });
  if (target) redirect(target);
  return (
    <SupportRoute
      requires={[SUPPORT_CAPABILITY.BOOKING_VIEW, SUPPORT_CAPABILITY.BOOKING_REQUEST_VIEW]}
    >
      <Suspense fallback={<LoadingState variant="page" />}>
        <BookingsListView />
      </Suspense>
    </SupportRoute>
  );
}
