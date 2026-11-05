import { Suspense } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { BookingHistoryView } from '@/features/bookings/components/BookingHistoryView';

/** "Đơn đã kết thúc" (05/11/2026) — client island đọc `useSearchParams` ⇒ cần `Suspense`. */
export default function BookingsEndedPage() {
  return (
    <Suspense fallback={<LoadingState variant="page" />}>
      <BookingHistoryView />
    </Suspense>
  );
}
