import { BookingRequestInboxScreen } from '@/features/booking-requests/BookingRequestInboxScreen';

/**
 * Hộp thư yêu cầu (BKG-02 → 05).
 *
 * Một màn duy nhất, không có màn chi tiết riêng: mọi thứ gian hàng cần để quyết định đã nằm
 * trên thẻ, và hai quyết định (duyệt / từ chối) mở bằng tấm trượt. Đẩy thêm một nấc chi tiết
 * là thêm một cú chạm cho việc thường ngày nhất của màn này.
 */
export default function ManageRequestsRoute() {
  return <BookingRequestInboxScreen />;
}
