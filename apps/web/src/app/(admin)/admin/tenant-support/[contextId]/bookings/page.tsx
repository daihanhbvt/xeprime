import { SUPPORT_CAPABILITY } from '@xeprime/types';
import { Suspense } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { BookingsListView } from '@/features/bookings/components/BookingsListView';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Đơn thuê — CHÍNH `BookingsListView`. */
export default function Page() {
  return (
    <SupportRoute requires={SUPPORT_CAPABILITY.BOOKING_VIEW}>
      <Suspense fallback={<LoadingState variant="page" />}>
        <BookingsListView />
      </Suspense>
    </SupportRoute>
  );
}
