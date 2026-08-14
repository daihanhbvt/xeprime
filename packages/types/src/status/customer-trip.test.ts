import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS, BOOKING_STATUS_VALUES } from './booking';
import { BOOKING_REQUEST_STATUS, BOOKING_REQUEST_STATUS_VALUES } from './booking-request';
import {
  CUSTOMER_TRIP_FILTER,
  CUSTOMER_TRIP_FILTER_STAGES,
  CUSTOMER_TRIP_STAGE,
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

  it('từ chối và quá hạn phản hồi cùng là một kết cục với khách', () => {
    for (const status of [
      BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
      BOOKING_REQUEST_STATUS.EXPIRED,
    ]) {
      expect(customerTripStage({ requestStatus: status, bookingStatus: null })).toBe(
        CUSTOMER_TRIP_STAGE.REJECTED,
      );
    }
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

  it('sẵn sàng và đang thuê dùng CÙNG một dòng thời gian: xác nhận xong, hoàn thành chưa', () => {
    for (const stage of [CUSTOMER_TRIP_STAGE.READY, CUSTOMER_TRIP_STAGE.ACTIVE]) {
      expect(customerTripTimeline(stage)).toEqual({
        visible: true,
        confirmedDone: true,
        completedDone: false,
      });
    }
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
  it('mỗi chặng thuộc đúng một tab (ngoài tab Tất cả)', () => {
    const buckets = Object.entries(CUSTOMER_TRIP_FILTER_STAGES).filter(
      ([key]) => key !== CUSTOMER_TRIP_FILTER.ALL,
    );
    for (const stage of CUSTOMER_TRIP_STAGE_VALUES) {
      const hits = buckets.filter(([, stages]) => stages.includes(stage));
      expect(hits).toHaveLength(1);
    }
  });

  it('isCustomerTripClosed đúng với các kết cục cuối', () => {
    expect(isCustomerTripClosed(CUSTOMER_TRIP_STAGE.ACTIVE)).toBe(false);
    expect(isCustomerTripClosed(CUSTOMER_TRIP_STAGE.READY)).toBe(false);
    expect(isCustomerTripClosed(CUSTOMER_TRIP_STAGE.PENDING_APPROVAL)).toBe(false);
    expect(isCustomerTripClosed(CUSTOMER_TRIP_STAGE.COMPLETED)).toBe(true);
    expect(isCustomerTripClosed(CUSTOMER_TRIP_STAGE.REJECTED)).toBe(true);
  });
});
