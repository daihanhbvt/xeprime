import { redirect } from 'next/navigation';
import { ROUTES } from '@/constants/routes';
import { legacyOwnerTripsTarget } from '@/features/bookings/rentals-redirect';

/**
 * "Chuyến cho thuê" — danh sách thẻ riêng của chủ xe tuyến hoa hồng (07/10/2026) — đã nhường chỗ cho
 * màn "Đơn thuê xe" dùng chung với gian hàng (06/11/2026, sổ cái `docs/design/09_PARTNER_REDESIGN.md`
 * §2.2). Route ở lại làm CHUYỂN TIẾP cho mọi người: tab "Lịch sử chuyến" → "Đơn đã kết thúc", còn lại
 * → "Đơn thuê xe". Link trong thông báo, email và bookmark không chết.
 */
export default async function OwnerTripsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(
    legacyOwnerTripsTarget(await searchParams, {
      bookings: ROUTES.MANAGE.BOOKINGS,
      ended: ROUTES.MANAGE.BOOKINGS_ENDED,
    }),
  );
}
