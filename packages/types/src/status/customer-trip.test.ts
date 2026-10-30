import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS, BOOKING_STATUS_VALUES } from './booking';
import { BOOKING_REQUEST_STATUS, BOOKING_REQUEST_STATUS_VALUES } from './booking-request';
import {
  CUSTOMER_TRIP_FILTER,
  CUSTOMER_TRIP_FILTER_DEFAULT,
  CUSTOMER_TRIP_FILTER_STAGES,
  CUSTOMER_TRIP_FILTER_VALUES,
  CUSTOMER_TRIP_STAGE,
  CUSTOMER_TRIP_STAGE_LIVE_VALUES,
  CUSTOMER_TRIP_STAGE_VALUES,
  customerTripStage,
  customerTripTimeline,
  isCustomerTripClosed,
} from './customer-trip';

describe('customerTripStage', () => {
  it('yêu cầu chưa duyệt (chưa có đơn) → chờ xác nhận', () => {
    expect(
      customerTripStage({
        requestStatus: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        bookingStatus: null,
      }),
    ).toBe(CUSTOMER_TRIP_STAGE.PENDING_APPROVAL);
  });

  it('gộp `reserved` và `confirmed` thành một chặng `Sẵn sàng`', () => {
    for (const status of [BOOKING_STATUS.RESERVED, BOOKING_STATUS.CONFIRMED]) {
      expect(
        customerTripStage({
          requestStatus: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
          bookingStatus: status,
        }),
      ).toBe(CUSTOMER_TRIP_STAGE.READY);
    }
  });

  it('trạng thái ĐƠN thắng trạng thái yêu cầu khi cả hai cùng tồn tại', () => {
    // `converted_to_booking` đứng yên trong khi đơn chạy tiếp — đọc nhầm nó là chặng của khách
    // thì chuyến đang thuê vẫn hiện `Sẵn sàng`.
    expect(
      customerTripStage({
        requestStatus: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        bookingStatus: BOOKING_STATUS.ACTIVE,
      }),
    ).toBe(CUSTOMER_TRIP_STAGE.ACTIVE);
  });

  /*
   * Hai kết cục KHÁC nhau (07/10/2026): "bị từ chối" là chủ xe đã trả lời "không"; "quá hạn phản
   * hồi" là không ai trả lời. Gộp nhãn thì chủ xe thấy "Bị từ chối" cho yêu cầu chưa từng mở.
   */
  it('từ chối và quá hạn phản hồi là HAI chặng riêng, cùng đã khép', () => {
    expect(
      customerTripStage({
        requestStatus: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
        bookingStatus: null,
      }),
    ).toBe(CUSTOMER_TRIP_STAGE.REJECTED);
    expect(
      customerTripStage({ requestStatus: BOOKING_REQUEST_STATUS.EXPIRED, bookingStatus: null }),
    ).toBe(CUSTOMER_TRIP_STAGE.EXPIRED);
    expect(isCustomerTripClosed(CUSTOMER_TRIP_STAGE.EXPIRED)).toBe(true);
  });

  it('huỷ và không-nhận-xe KHÔNG bị gộp vào nhau', () => {
    expect(
      customerTripStage({
        requestStatus: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        bookingStatus: BOOKING_STATUS.CANCELLED,
      }),
    ).toBe(CUSTOMER_TRIP_STAGE.CANCELLED);
    expect(
      customerTripStage({
        requestStatus: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        bookingStatus: BOOKING_STATUS.NO_SHOW,
      }),
    ).toBe(CUSTOMER_TRIP_STAGE.NO_SHOW);
  });

  it('phủ hết mọi tổ hợp trạng thái thật — không tổ hợp nào rơi ra ngoài', () => {
    for (const requestStatus of BOOKING_REQUEST_STATUS_VALUES) {
      expect(CUSTOMER_TRIP_STAGE_VALUES).toContain(
        customerTripStage({ requestStatus, bookingStatus: null }),
      );
      for (const bookingStatus of BOOKING_STATUS_VALUES) {
        expect(CUSTOMER_TRIP_STAGE_VALUES).toContain(
          customerTripStage({ requestStatus, bookingStatus }),
        );
      }
    }
  });
});

describe('customerTripTimeline', () => {
  it('chờ xác nhận KHÔNG dựng dòng thời gian hai mốc', () => {
    expect(customerTripTimeline(CUSTOMER_TRIP_STAGE.PENDING_APPROVAL).visible).toBe(false);
  });

  it('mốc đầu là "Đã nhận xe": sẵn sàng chưa tích, đang thuê đã tích, hoàn thành chưa', () => {
    expect(customerTripTimeline(CUSTOMER_TRIP_STAGE.READY)).toEqual({
      visible: true,
      confirmedDone: false,
      completedDone: false,
    });
    expect(customerTripTimeline(CUSTOMER_TRIP_STAGE.ACTIVE)).toEqual({
      visible: true,
      confirmedDone: true,
      completedDone: false,
    });
  });

  it('hoàn thành đóng cả hai mốc', () => {
    expect(customerTripTimeline(CUSTOMER_TRIP_STAGE.COMPLETED)).toEqual({
      visible: true,
      confirmedDone: true,
      completedDone: true,
    });
  });

  it('huỷ / từ chối / không nhận xe không bao giờ hiện như đi hết chuyến', () => {
    for (const stage of [
      CUSTOMER_TRIP_STAGE.CANCELLED,
      CUSTOMER_TRIP_STAGE.REJECTED,
      CUSTOMER_TRIP_STAGE.EXPIRED,
      CUSTOMER_TRIP_STAGE.NO_SHOW,
    ]) {
      const timeline = customerTripTimeline(stage);
      expect(timeline.visible).toBe(false);
      expect(timeline.completedDone).toBe(false);
    }
  });

  it('luôn đúng hai mốc — không có chặng nào sinh thêm mốc thứ ba', () => {
    for (const stage of CUSTOMER_TRIP_STAGE_VALUES) {
      expect(Object.keys(customerTripTimeline(stage))).toEqual([
        'visible',
        'confirmedDone',
        'completedDone',
      ]);
    }
  });
});

describe('bộ lọc', () => {
  it('đúng hai tab — không mọc lại một tab cho mỗi chặng', () => {
    expect(CUSTOMER_TRIP_FILTER_VALUES).toEqual([
      CUSTOMER_TRIP_FILTER.CURRENT,
      CUSTOMER_TRIP_FILTER.HISTORY,
    ]);
  });

  it('hai tab phủ kín mọi chặng THẬT và không giao nhau', () => {
    // Không còn tab `Tất cả` để hứng phần rơi rớt: chặng nào không thuộc đúng một tab là một
    // chuyến biến mất khỏi màn hình của khách.
    for (const stage of CUSTOMER_TRIP_STAGE_LIVE_VALUES) {
      const hits = Object.values(CUSTOMER_TRIP_FILTER_STAGES).filter((stages) =>
        stages.includes(stage),
      );
      expect(hits).toHaveLength(1);
    }
  });

  // Chặng đã gỡ (ADR 0055) không còn là một lựa chọn lọc ở tab nào.
  it('chặng đã gỡ pending_approval_paid không nằm ở tab nào', () => {
    for (const stages of Object.values(CUSTOMER_TRIP_FILTER_STAGES)) {
      expect(stages).not.toContain(CUSTOMER_TRIP_STAGE.PENDING_APPROVAL_PAID);
    }
  });

  it('`Lịch sử chuyến` đúng bằng tập chặng đã khép', () => {
    expect([...CUSTOMER_TRIP_FILTER_STAGES[CUSTOMER_TRIP_FILTER.HISTORY]].sort()).toEqual(
      CUSTOMER_TRIP_STAGE_VALUES.filter(isCustomerTripClosed).sort(),
    );
    expect(CUSTOMER_TRIP_FILTER_STAGES[CUSTOMER_TRIP_FILTER.CURRENT]).toContain(
      CUSTOMER_TRIP_STAGE.AWAITING_HOLD,
    );
  });

  it('mở màn ở tab chuyến hiện tại', () => {
    expect(CUSTOMER_TRIP_FILTER_DEFAULT).toBe(CUSTOMER_TRIP_FILTER.CURRENT);
  });

  it('isCustomerTripClosed đúng với các kết cục cuối', () => {
    expect(isCustomerTripClosed(CUSTOMER_TRIP_STAGE.ACTIVE)).toBe(false);
    expect(isCustomerTripClosed(CUSTOMER_TRIP_STAGE.READY)).toBe(false);
    expect(isCustomerTripClosed(CUSTOMER_TRIP_STAGE.PENDING_APPROVAL)).toBe(false);
    expect(isCustomerTripClosed(CUSTOMER_TRIP_STAGE.COMPLETED)).toBe(true);
    expect(isCustomerTripClosed(CUSTOMER_TRIP_STAGE.REJECTED)).toBe(true);
  });
});
