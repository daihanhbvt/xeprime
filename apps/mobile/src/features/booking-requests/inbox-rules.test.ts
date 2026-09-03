import {
  BOOKING_REQUEST_STATUS,
  bookingRequestRespondBy,
  BOOKING_REQUEST_RESPOND_WINDOW_MINUTES,
  isBookingRequestPastDue,
} from '@xeprime/types';
import { bookingRequestFiltersToParams, BOOKING_REQUEST_STATUS_ALL } from '@xeprime/api-client';
import {
  DEFAULT_REQUEST_TAB,
  REQUEST_INBOX_TABS,
  statusCountOf,
} from './hooks/use-booking-requests';

describe('tab của hộp thư yêu cầu', () => {
  it('mặc định là việc cần làm ngay', () => {
    expect(DEFAULT_REQUEST_TAB).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
  });

  /**
   * Duyệt tạo đơn + giữ chỗ lịch trong CÙNG một transaction, nên trạng thái đi thẳng sang
   * `converted_to_booking`. Một tab `approved_by_host` sẽ luôn rỗng — bày ra là hứa một ngăn
   * chứa thứ không bao giờ tới đó.
   */
  it('KHÔNG có tab approved_by_host', () => {
    expect(REQUEST_INBOX_TABS.map((tab) => tab.value)).not.toContain(
      BOOKING_REQUEST_STATUS.APPROVED_BY_HOST,
    );
  });

  it('có đủ năm trạng thái còn lại cộng tab Tất cả', () => {
    expect(REQUEST_INBOX_TABS.map((tab) => tab.value)).toEqual([
      BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
      BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER,
      BOOKING_REQUEST_STATUS.EXPIRED,
      BOOKING_REQUEST_STATUS_ALL,
    ]);

    /*
     * Nhãn tab dùng khoá RIÊNG trong `BookingRequests.tabs`, không phải nhãn trạng thái —
     * "Cần xử lý" chứ không phải "Chờ gian hàng duyệt". Đây là bộ chữ web dùng; khoá lại để hai
     * nền tảng không trôi thành hai cách gọi khác nhau cho cùng một ngăn.
     */
    expect(REQUEST_INBOX_TABS.map((tab) => tab.labelKey)).toEqual([
      'needsAction',
      'converted',
      'rejected',
      'cancelled',
      'expired',
      'all',
    ]);
  });
});

/**
 * `all` là giá trị THẬT của tab, không phải "không lọc" — bỏ tham số đi thì màn rơi về mặc định
 * `pending_host_approval`. Phép dịch sang "không gửi `status`" chỉ được xảy ra ở lớp gọi API.
 */
describe('filtersToParams', () => {
  it('dịch tab "all" thành KHÔNG gửi status', () => {
    expect(bookingRequestFiltersToParams({ status: BOOKING_REQUEST_STATUS_ALL }).status).toBeNull();
  });

  it('giữ nguyên mã trạng thái thật', () => {
    expect(bookingRequestFiltersToParams({ status: BOOKING_REQUEST_STATUS.EXPIRED }).status).toBe(
      BOOKING_REQUEST_STATUS.EXPIRED,
    );
  });

  it('bỏ hẳn bộ lọc rỗng thay vì gửi chuỗi trống', () => {
    const params = bookingRequestFiltersToParams({});
    expect(params.q).toBeNull();
    expect(params.vehicleId).toBeNull();
    expect(params.branchId).toBeNull();
  });
});

describe('statusCountOf', () => {
  const counts = [
    { status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, count: 7 },
    { status: BOOKING_REQUEST_STATUS.EXPIRED, count: 2 },
  ];

  it('đọc số của server, KHÔNG đếm trên trang đang mở', () => {
    // Bảng đếm phủ 9 yêu cầu trong khi trang chỉ chở tối đa `limit` bản ghi — và với danh sách
    // rỗng thì số vẫn đúng. Đó chính là điều phép đếm ở client không làm được.
    expect(statusCountOf(counts, BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL)).toBe(7);
  });

  it('trạng thái không có trong bảng đếm là 0, không phải undefined', () => {
    expect(statusCountOf(counts, BOOKING_REQUEST_STATUS.REJECTED_BY_HOST)).toBe(0);
  });

  it('tab Tất cả cộng mọi trạng thái', () => {
    expect(statusCountOf(counts, BOOKING_REQUEST_STATUS_ALL)).toBe(9);
  });

  it('chưa có lần đọc nào thì huy hiệu là 0', () => {
    expect(statusCountOf([], BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL)).toBe(0);
  });
});

/**
 * Hạn phản hồi so MỐC chứ không so cột `status`: worker ghi `expired` trễ một nhịp, và cửa sổ
 * đó là một lỗ để duyệt một yêu cầu đã chết.
 */
describe('hạn phản hồi 60 phút', () => {
  const sentAt = new Date('2026-09-01T10:00:00.000Z');
  const respondBy = bookingRequestRespondBy(sentAt);

  it('đúng 60 phút kể từ lúc khách gửi', () => {
    expect(BOOKING_REQUEST_RESPOND_WINDOW_MINUTES).toBe(60);
    expect(respondBy.toISOString()).toBe('2026-09-01T11:00:00.000Z');
  });

  it('còn 1 phút thì CHƯA quá hạn', () => {
    expect(isBookingRequestPastDue(respondBy, new Date('2026-09-01T10:59:00.000Z'))).toBe(false);
  });

  it('đúng mốc là đã quá hạn', () => {
    expect(isBookingRequestPastDue(respondBy, new Date('2026-09-01T11:00:00.000Z'))).toBe(true);
  });
});
