import { TRIP_ROLE } from '@xeprime/types';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { TripsScreen } from '@/features/trips/TripsScreen';
import { ROUTES } from '@/navigation/routes';

/**
 * Lối CHUYỂN TIẾP — chuyến ĐI THUÊ cũ của người đăng nhập, bên trong khu quản lý.
 *
 * `lockedRole` khoá vai `renter`: chuyến gian hàng CHO THUÊ sống ở `/manage/bookings`, nơi có đầy
 * đủ công cụ vận hành. Là quyết định ĐIỀU HƯỚNG, không phải hàng rào — server vẫn kiểm phạm vi
 * của từng chuyến (ADR 0038 điều 8).
 */
export default function ManageAccountTripsRoute() {
  return (
    <>
      {/* Màn của khu quản lý: có vỏ quản lý (thanh trên + sidebar) như mọi màn cùng cấp. */}
      <ManageHeader />
      <TripsScreen
        lockedRole={TRIP_ROLE.RENTER}
        detailHref={ROUTES.manage.accountTripDetail}
        heading
      />
    </>
  );
}
