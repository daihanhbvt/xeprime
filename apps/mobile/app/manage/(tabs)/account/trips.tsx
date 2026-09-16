import { TRIP_ROLE } from '@xeprime/types';
import { TripsScreen } from '@/features/trips/TripsScreen';

/**
 * Lối CHUYỂN TIẾP — chuyến ĐI THUÊ cũ của người đăng nhập, bên trong khu quản lý.
 *
 * `lockedRole` khoá vai `renter`: chuyến gian hàng CHO THUÊ sống ở `/manage/bookings`, nơi có đầy
 * đủ công cụ vận hành. Là quyết định ĐIỀU HƯỚNG, không phải hàng rào — server vẫn kiểm phạm vi
 * của từng chuyến (ADR 0038 điều 8).
 */
export default function ManageAccountTripsRoute() {
  return <TripsScreen lockedRole={TRIP_ROLE.RENTER} />;
}
