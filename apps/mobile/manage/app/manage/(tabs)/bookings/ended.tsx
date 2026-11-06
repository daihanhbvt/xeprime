import { BookingHistoryScreen } from '@/features/bookings/BookingHistoryScreen';

/**
 * "Đơn đã kết thúc" (05/11/2026) — cùng cách đặt cạnh `[id]` như `awaiting-pickup`: đoạn TĨNH
 * thắng đoạn động, và mã đơn là ULID nên không đơn nào mang tên này.
 */
export default function ManageBookingsEndedRoute() {
  return <BookingHistoryScreen />;
}
