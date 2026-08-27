import { Suspense } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { BookingRequestsView } from '@/features/booking-requests/components/BookingRequestsView';

/**
 * Hộp thư yêu cầu thuê của gian hàng.
 *
 * Route giữ nguyên là **Server Component**: nó không có state, không effect, không đọc
 * `useSearchParams`. Toàn bộ phần tương tác (filter đọc URL, TanStack Query, ba hộp thoại,
 * ba mutation) nằm trong `BookingRequestsView` — một hòn đảo client duy nhất.
 *
 * `<Suspense>` là bắt buộc vì bên trong có `useSearchParams` (ADR 0004): thiếu nó Next bắt cả
 * route rơi sang render động ở client.
 */
export default function BookingRequestsPage() {
  return (
    <Suspense fallback={<LoadingState variant="cards" rows={4} />}>
      <BookingRequestsView />
    </Suspense>
  );
}
