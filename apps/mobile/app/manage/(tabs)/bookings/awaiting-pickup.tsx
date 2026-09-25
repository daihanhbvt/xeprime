import { BOOKING_LIST_PRESET } from '@xeprime/types';
import { BookingListScreen } from '@/features/bookings/BookingListScreen';

/**
 * "Chờ giao xe" — CÙNG danh sách đơn, cùng endpoint, chỉ khoá sẵn một nhóm việc (ADR 0047).
 *
 * Là một ROUTE chứ không phải một tab bên trong màn đơn thuê: mục đang mở trong ngăn kéo quản lý
 * được quyết bằng đường dẫn, và nhóm việc này là một mục menu riêng đứng giữa "Yêu cầu đặt xe"
 * và "Tất cả đơn thuê" — đúng nhịp làm việc.
 *
 * Đứng cạnh `[id]` là an toàn: expo-router ưu tiên đoạn TĨNH, và mã đơn là ULID 26 ký tự nên
 * không có đơn nào mang tên này. `new.tsx` đã sống cùng `[id]/` theo đúng cách đó từ trước.
 */
export default function ManageBookingsAwaitingPickupRoute() {
  return <BookingListScreen preset={BOOKING_LIST_PRESET.AWAITING_PICKUP} />;
}
