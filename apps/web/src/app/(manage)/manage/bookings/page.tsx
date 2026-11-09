import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ROUTES } from '@/constants/routes';
import { BookingsListView } from '@/features/bookings/components/BookingsListView';
import { legacyEndedBookingsTarget } from '@/features/bookings/rentals-redirect';

/**
 * "Đơn thuê xe" — màn gộp yêu cầu + đơn (05/11/2026). Server Component mỏng: link cũ trỏ vào một
 * ngăn đã kết thúc chuyển sang "Đơn đã kết thúc" TRƯỚC khi dựng gì; phần còn lại là một client
 * island (`BookingsListView` đọc `useSearchParams` ⇒ cần `Suspense`).
 */
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const target = legacyEndedBookingsTarget(await searchParams, {
    bookings: ROUTES.MANAGE.BOOKINGS,
    ended: ROUTES.MANAGE.BOOKINGS_ENDED,
  });
  if (target) redirect(target);
  return (
    <Suspense fallback={<LoadingState variant="cards" rows={4} />}>
      <BookingsListView />
    </Suspense>
  );
}
