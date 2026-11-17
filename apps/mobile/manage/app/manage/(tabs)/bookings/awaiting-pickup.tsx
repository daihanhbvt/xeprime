import { RentalsScreen } from '@/features/bookings/RentalsScreen';
import { RENTAL_STAGE } from '@/features/bookings/rental-stages';

/**
 * "Chờ giao xe" cũ — nay là một NHÓM của "Đơn thuê xe" gộp (web: route cũ chuyển tiếp, mục ẩn đã
 * gỡ 02/11/2026). Giữ đường dẫn cho deep link và thông báo cũ.
 */
export default function ManageBookingsAwaitingPickupRoute() {
  return <RentalsScreen initialStage={RENTAL_STAGE.AWAITING_PICKUP} />;
}
