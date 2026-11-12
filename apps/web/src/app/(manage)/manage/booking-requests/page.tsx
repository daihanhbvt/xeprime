import { redirect } from 'next/navigation';
import { ROUTES } from '@/constants/routes';
import { legacyRequestsTarget } from '@/features/bookings/rentals-redirect';

/**
 * Hộp thư "Yêu cầu đặt xe" đã gộp vào màn "Đơn thuê xe" (05/11/2026). Route ở lại làm CHUYỂN TIẾP:
 * `?status=` cũ → nhóm Cần xử lý / Chờ khách thanh toán, hoặc ngăn "Không thành đơn" của màn "Đơn
 * đã kết thúc"; bộ lọc tìm kiếm / chi nhánh / dịch vụ đi theo. Link trong email, thông báo và
 * bookmark không chết.
 */
export default async function BookingRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(
    legacyRequestsTarget(await searchParams, {
      bookings: ROUTES.MANAGE.BOOKINGS,
      ended: ROUTES.MANAGE.BOOKINGS_ENDED,
    }),
  );
}
