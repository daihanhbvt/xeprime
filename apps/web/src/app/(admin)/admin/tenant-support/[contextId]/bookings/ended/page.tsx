import { SUPPORT_CAPABILITY } from '@xeprime/types';
import { Suspense } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { BookingHistoryView } from '@/features/bookings/components/BookingHistoryView';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** "Đơn đã kết thúc" trong phiên hỗ trợ — CHÍNH `BookingHistoryView`, chỉ đọc. */
export default function Page() {
  return (
    <SupportRoute requires={SUPPORT_CAPABILITY.BOOKING_VIEW}>
      <Suspense fallback={<LoadingState variant="page" />}>
        <BookingHistoryView />
      </Suspense>
    </SupportRoute>
  );
}
