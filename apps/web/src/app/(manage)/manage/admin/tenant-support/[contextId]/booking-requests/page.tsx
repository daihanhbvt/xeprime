import { SUPPORT_CAPABILITY } from '@xeprime/types';
import { Suspense } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { BookingRequestsView } from '@/features/booking-requests/components/BookingRequestsView';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Yêu cầu thuê — CHÍNH `BookingRequestsView`; liên hệ khách bị che ở server. */
export default function Page() {
  return (
    <SupportRoute requires={SUPPORT_CAPABILITY.BOOKING_REQUEST_VIEW}>
      <Suspense fallback={<LoadingState variant="cards" rows={4} />}>
        <BookingRequestsView />
      </Suspense>
    </SupportRoute>
  );
}
