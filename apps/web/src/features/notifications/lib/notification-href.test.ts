import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TARGET_TYPE } from '@xeprime/types';

import { notificationHref } from './notification-display';

/**
 * Link click-through của thông báo (Wave 11).
 *
 * Điều được khoá: thông báo của KHÁCH dẫn tới đúng chuyến, không phải danh sách chung — bấm
 * "Chuyến đi đã hoàn thành" rồi phải tự dò lại trong danh sách là mất luôn giá trị của thông báo.
 */
describe('notificationHref — khu khách', () => {
  it('đơn thuê và yêu cầu thuê đều dẫn thẳng tới chuyến', () => {
    // Backend nhận CẢ HAI loại id cho cùng một chuyến, nên thông báo phát trước khi có đơn
    // (targetType = booking_request) vẫn tới đúng nơi.
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING, targetId: 'BK1' },
        'customer',
      ),
    ).toBe('/trips/BK1');
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST, targetId: 'RQ1' },
        'customer',
      ),
    ).toBe('/trips/RQ1');
  });

  it('thiếu targetId thì lùi về danh sách thay vì dựng /trips/undefined', () => {
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING, targetId: null },
        'customer',
      ),
    ).toBe('/trips');
  });

  it('đánh giá KHÔNG dựng link chuyến — targetId của nó là id review', () => {
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.REVIEW, targetId: 'RV1' },
        'customer',
      ),
    ).toBe('/trips');
  });

  it('loại không liên quan tới khách thì không có đích', () => {
    expect(
      notificationHref({ targetType: NOTIFICATION_TARGET_TYPE.TENANT, targetId: 'T1' }, 'customer'),
    ).toBeNull();
  });
});

describe('notificationHref — khu quản lý không bị đổi', () => {
  it('vẫn dẫn về màn danh sách của shop, không phải /trips', () => {
    expect(
      notificationHref({ targetType: NOTIFICATION_TARGET_TYPE.BOOKING, targetId: 'BK1' }, 'manage'),
    ).toBe('/manage/bookings');
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST, targetId: 'RQ1' },
        'manage',
      ),
    ).toBe('/manage/booking-requests');
  });
});

describe('notificationHref — Owner Lite (chủ xe tuyến hoa hồng)', () => {
  it('đơn và yêu cầu dẫn tới "Chuyến cho thuê" — tuyến hoa hồng không có hộp thư/bảng đơn', () => {
    expect(
      notificationHref({ targetType: NOTIFICATION_TARGET_TYPE.BOOKING, targetId: 'BK1' }, 'owner'),
    ).toBe('/manage/trips');
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST, targetId: 'RQ1' },
        'owner',
      ),
    ).toBe('/manage/trips');
  });

  it('xe vẫn dẫn về danh sách xe như tuyến gói', () => {
    expect(
      notificationHref({ targetType: NOTIFICATION_TARGET_TYPE.VEHICLE, targetId: 'V1' }, 'owner'),
    ).toBe('/manage/vehicles');
  });
});
