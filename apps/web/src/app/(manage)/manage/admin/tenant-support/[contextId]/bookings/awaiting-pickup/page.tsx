import { BOOKING_LIST_PRESET, SUPPORT_CAPABILITY } from '@xeprime/types';
import { Suspense } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { BookingsListView } from '@/features/bookings/components/BookingsListView';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Chờ giao xe — CHÍNH `BookingsListView` với preset chờ giao. */
export default function Page() {
  return (
    <SupportRoute requires={SUPPORT_CAPABILITY.BOOKING_VIEW}>
      <Suspense fallback={<LoadingState variant="page" />}>
        <BookingsListView preset={BOOKING_LIST_PRESET.AWAITING_PICKUP} />
      </Suspense>
    </SupportRoute>
  );
}
