import {
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_VALUES,
  bookingRequestRespondBy,
  BOOKING_REQUEST_RESPOND_WINDOW_MINUTES,
  isBookingRequestPastDue,
} from '@xeprime/types';
import {
  bookingRequestFiltersToParams,
  BOOKING_REQUEST_CLOSED_STATUSES,
  BOOKING_REQUEST_NEEDS_ACTION_STATUSES,
  BOOKING_REQUEST_STATUS_ALL,
  BOOKING_REQUEST_TAB_CLOSED,
  BOOKING_REQUEST_TAB_NEEDS_ACTION,
} from '@/api/booking-requests/api';
import {
  DEFAULT_REQUEST_TAB,
  REQUEST_INBOX_TABS,
  statusCountOf,
} from './hooks/use-booking-requests';

describe('tab của hộp thư yêu cầu', () => {
  it('mặc định là tab GỘP việc cần làm ngay', () => {
    expect(DEFAULT_REQUEST_TAB).toBe(BOOKING_REQUEST_TAB_NEEDS_ACTION);
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

  /**
   * ĐÚNG BA TAB (ADR 0047), mỗi tab một câu hỏi vận hành. Không còn tab "Đã tạo đơn" (tra ở danh
   * sách đơn thuê) và không còn tab "Tất cả" — ba tab đã phủ hết 11 trạng thái.
   */
  it('có đúng BA tab, đúng thứ tự nhịp làm việc', () => {
    expect(REQUEST_INBOX_TABS.map((tab) => tab.value)).toEqual([
      BOOKING_REQUEST_TAB_NEEDS_ACTION,
      BOOKING_REQUEST_STATUS.AWAITING_HOLD,
      BOOKING_REQUEST_TAB_CLOSED,
    ]);

    /*
     * Nhãn tab dùng khoá RIÊNG trong `BookingRequests.tabs`, không phải nhãn trạng thái —
     * "Cần xử lý" chứ không phải "Chờ gian hàng duyệt". Đây là bộ chữ web dùng; khoá lại để hai
     * nền tảng không trôi thành hai cách gọi khác nhau cho cùng một ngăn.
     */
    expect(REQUEST_INBOX_TABS.map((tab) => tab.labelKey)).toEqual([
      'needsAction',
      'awaitingPayment',
      'closed',
    ]);
  });

  it('tab GỘP mang đúng hai trạng thái cần quyết định, không kèm awaiting_hold', () => {
    const needsAction = REQUEST_INBOX_TABS[0];
    expect(needsAction?.statuses).toEqual([
      BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      BOOKING_REQUEST_STATUS.HOLD_PAID,
    ]);
    expect(needsAction?.statuses).not.toContain(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
  });

  /**
   * `awaiting_hold` nay CÓ ngăn riêng (ADR 0047 — đảo ngược quyết định 19/09/2026).
   *
   * Lý do đảo: lúc đó vẫn còn tab "Tất cả" để xem nó; bỏ tab đó đi mà không cho nó tab riêng thì
   * "đã nhận chuyến, đang chờ khách chuyển tiền" không còn chỗ nào xem được.
   */
  it('awaiting_hold có tab RIÊNG', () => {
    const awaiting = REQUEST_INBOX_TABS[1];
    expect(awaiting?.value).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    expect(awaiting?.statuses).toEqual([BOOKING_REQUEST_STATUS.AWAITING_HOLD]);
  });

  /**
   * Tab "Đã đóng" gộp SÁU kết cục — gồm cả `slot_taken` và `cancelled_by_host`, hai trạng thái
   * trước đây KHÔNG có ngăn nào ngoài tab "Tất cả" đã bỏ.
   *
   * `converted_to_booking` KHÔNG thuộc nhóm này: nó là kết cục THÀNH CÔNG, không phải "đã đóng"
   * theo nghĩa hỏng việc.
   */
  it('tab Đã đóng gộp sáu kết cục, KHÔNG gồm converted_to_booking', () => {
    const closed = REQUEST_INBOX_TABS[2];
    expect(closed?.statuses).toEqual([
      BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
      BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER,
      BOOKING_REQUEST_STATUS.EXPIRED,
      BOOKING_REQUEST_STATUS.HOLD_EXPIRED,
      BOOKING_REQUEST_STATUS.SLOT_TAKEN,
      BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST,
    ]);
    expect(closed?.statuses).not.toContain(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
  });

  /**
   * Ba tab phải phủ HẾT 11 trạng thái — đó là lập luận duy nhất biện minh cho việc bỏ tab
   * "Tất cả". Một trạng thái rơi ra ngoài là một yêu cầu không ngăn nào xem được.
   *
   * Trừ `approved_by_host`: ADR 0047 điều 7 đã xác minh nó CHẾT (0 writer, 0 hàng ở cả DB dev
   * lẫn DB test), giữ trong enum chỉ vì test này còn tham chiếu.
   */
  it('ba tab phủ hết mọi trạng thái còn sống', () => {
    const covered = new Set(REQUEST_INBOX_TABS.flatMap((tab) => [...tab.statuses]));
    const alive = BOOKING_REQUEST_STATUS_VALUES.filter(
      (status) =>
        status !== BOOKING_REQUEST_STATUS.APPROVED_BY_HOST &&
        status !== BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
    );
    expect(alive.filter((status) => !covered.has(status))).toEqual([]);
  });
});

describe('filtersToParams', () => {
  /**
   * `all` KHÔNG còn là một tab (ADR 0047) — nhưng một deep link hay bookmark cũ vẫn có thể mang
   * `status=all`. Đẩy nguyên chữ đó lên backend thì nó bị từ chối (không nằm trong
   * `BOOKING_REQUEST_STATUS_VALUES`) và liên kết cũ vỡ ngay khi mở; rơi về "không lọc" thì màn
   * vẫn dựng được. Đây là đường LÙI, không phải một lựa chọn còn sống.
   */
  it('vẫn dịch "all" cũ thành KHÔNG gửi status (tương thích ngược)', () => {
    expect(bookingRequestFiltersToParams({ status: BOOKING_REQUEST_STATUS_ALL }).status).toBeNull();
  });

  it('dịch tab GỘP thành hai mã thật nối dấu phẩy', () => {
    /*
     * MỘT chuỗi, không phải mảng: `QueryParams` của `@xeprime/api-client` cố ý không có kiểu
     * mảng, backend tách chuỗi ở DTO. Thứ tự phải khớp web để hai client gửi cùng một URL.
     */
    expect(bookingRequestFiltersToParams({ status: BOOKING_REQUEST_TAB_NEEDS_ACTION }).status).toBe(
      'pending_host_approval,hold_paid',
    );
  });

  it('dịch tab Đã đóng thành SÁU mã thật nối dấu phẩy', () => {
    expect(bookingRequestFiltersToParams({ status: BOOKING_REQUEST_TAB_CLOSED }).status).toBe(
      'rejected_by_host,cancelled_by_customer,expired,hold_expired,slot_taken,cancelled_by_host',
    );
  });

  it('tab Chờ khách thanh toán gửi THẲNG mã thật, không dịch', () => {
    expect(
      bookingRequestFiltersToParams({ status: BOOKING_REQUEST_STATUS.AWAITING_HOLD }).status,
    ).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
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

  it('tab GỘP cộng dồn hai trạng thái của nó', () => {
    // Đếm hụt ở đây nghĩa là tab "Cần xử lý" báo 7 trong khi danh sách bên dưới có 10 việc.
    const withHoldPaid = [...counts, { status: BOOKING_REQUEST_STATUS.HOLD_PAID, count: 3 }];
    expect(statusCountOf(withHoldPaid, BOOKING_REQUEST_TAB_NEEDS_ACTION)).toBe(10);
    expect(BOOKING_REQUEST_NEEDS_ACTION_STATUSES).toHaveLength(2);
  });

  /**
   * Tab "Đã đóng" cũng là một tab GỘP, và của nó có SÁU mã.
   *
   * Đây là ca dễ đếm hụt nhất: bảng đếm của server trả từng mã riêng, nên quên một mã trong
   * `BOOKING_REQUEST_CLOSED_STATUSES` là huy hiệu báo thiếu mà không có gì đỏ lên.
   */
  it('tab Đã đóng cộng dồn cả sáu trạng thái của nó', () => {
    const closedCounts = BOOKING_REQUEST_CLOSED_STATUSES.map((status) => ({ status, count: 1 }));
    expect(statusCountOf(closedCounts, BOOKING_REQUEST_TAB_CLOSED)).toBe(6);
    expect(BOOKING_REQUEST_CLOSED_STATUSES).toHaveLength(6);
  });

  /** `converted_to_booking` không thuộc tab nào — nó tra ở danh sách đơn thuê (ADR 0047). */
  it('KHÔNG cộng converted_to_booking vào tab Đã đóng', () => {
    const withConverted = [
      { status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING, count: 5 },
      { status: BOOKING_REQUEST_STATUS.EXPIRED, count: 2 },
    ];
    expect(statusCountOf(withConverted, BOOKING_REQUEST_TAB_CLOSED)).toBe(2);
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
