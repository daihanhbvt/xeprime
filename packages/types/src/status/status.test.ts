import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATUS,
  BOOKING_STATUS_VALUES,
  BOOKING_STATUS_META,
  BOOKING_STATUS_OCCUPYING,
  canTransitionBooking,
  isBookingFinal,
  occupiesSchedule,
  isBookingStatus,
} from './booking';
import { VEHICLE_PUBLIC_STATUS, VEHICLE_PUBLIC_STATUS_META } from './vehicle';
import { TENANT_STATUS, TENANT_STATUS_META } from './tenant';
import { BOOKING_REQUEST_STATUS, BOOKING_REQUEST_STATUS_META } from './booking-request';
import { REVIEW_STATUS, REVIEW_STATUS_META, isReviewStatus } from './review';
import {
  CONVERSATION_STATUS,
  CONVERSATION_STATUS_META,
  USER_STATUS,
  USER_STATUS_META,
} from './misc';
import { isParticipantType } from './chat';
import { STATUS_COLOR } from './meta';
import { NOTIFICATION_TYPE, NOTIFICATION_TYPE_META, isNotificationType } from '../notifications';

/**
 * Các test này bảo vệ ADR 0005: thêm một status mới mà quên khai báo nhãn hiển thị sẽ
 * làm StatusTag render ra `undefined` trên UI. TypeScript bắt được vì META là
 * `Record<Status, …>`, nhưng test chạy nhanh hơn và thông báo rõ hơn.
 */
describe('status metadata completeness', () => {
  it.each([
    ['booking', Object.values(BOOKING_STATUS), BOOKING_STATUS_META],
    ['booking_request', Object.values(BOOKING_REQUEST_STATUS), BOOKING_REQUEST_STATUS_META],
    ['vehicle public', Object.values(VEHICLE_PUBLIC_STATUS), VEHICLE_PUBLIC_STATUS_META],
    ['tenant', Object.values(TENANT_STATUS), TENANT_STATUS_META],
    ['review', Object.values(REVIEW_STATUS), REVIEW_STATUS_META],
    ['conversation', Object.values(CONVERSATION_STATUS), CONVERSATION_STATUS_META],
    ['user', Object.values(USER_STATUS), USER_STATUS_META],
    ['notification type', Object.values(NOTIFICATION_TYPE), NOTIFICATION_TYPE_META],
  ])('%s: mọi status đều có label và color', (_name, values, meta) => {
    for (const status of values) {
      const entry = (meta as Record<string, { label: string; color: string }>)[status];
      expect(entry, `thiếu meta cho "${status}"`).toBeDefined();
      expect(entry?.label).toBeTruthy();
      expect(entry?.color).toBeTruthy();
    }
  });
});

describe('bảng màu trạng thái dùng chung', () => {
  it('đơn thuê phân biệt rõ đang diễn ra, hoàn thành và lỗi', () => {
    expect(BOOKING_STATUS_META[BOOKING_STATUS.ACTIVE].color).toBe(STATUS_COLOR.PROCESSING);
    expect(BOOKING_STATUS_META[BOOKING_STATUS.COMPLETED].color).toBe(STATUS_COLOR.SUCCESS);
    expect(BOOKING_STATUS_META[BOOKING_STATUS.NO_SHOW].color).toBe(STATUS_COLOR.DANGER);
  });

  it('mọi màu metadata đều lấy từ palette chung', () => {
    const allowed = new Set(Object.values(STATUS_COLOR));
    const metas = [
      BOOKING_STATUS_META,
      BOOKING_REQUEST_STATUS_META,
      VEHICLE_PUBLIC_STATUS_META,
      TENANT_STATUS_META,
      REVIEW_STATUS_META,
      CONVERSATION_STATUS_META,
      USER_STATUS_META,
    ];

    for (const meta of metas) {
      for (const entry of Object.values(meta)) expect(allowed.has(entry.color)).toBe(true);
    }
  });
});

describe('ADR 0005 — bộ giá trị chốt', () => {
  it('booking dùng "active", không phải "in_progress" của user_flow doc', () => {
    expect(BOOKING_STATUS_VALUES).toContain('active');
    expect(BOOKING_STATUS_VALUES).not.toContain('in_progress');
    expect(BOOKING_STATUS_VALUES).not.toContain('draft');
  });

  it('vehicle dùng "approved_public", không phải "published"', () => {
    const values: string[] = Object.values(VEHICLE_PUBLIC_STATUS);
    expect(values).toContain('approved_public');
    expect(values).not.toContain('published');
  });

  it('booking request dùng "approved_by_host", không phải "approved"', () => {
    const values: string[] = Object.values(BOOKING_REQUEST_STATUS);
    expect(values).toContain('approved_by_host');
    expect(values).not.toContain('approved');
  });

  it('isBookingStatus từ chối giá trị lạ', () => {
    expect(isBookingStatus('active')).toBe(true);
    expect(isBookingStatus('aproved')).toBe(false);
    expect(isBookingStatus(null)).toBe(false);
  });

  it('review dùng "published"/"hidden"; guard từ chối giá trị lạ', () => {
    expect(Object.values(REVIEW_STATUS)).toEqual(['published', 'hidden']);
    expect(isReviewStatus('published')).toBe(true);
    expect(isReviewStatus('deleted')).toBe(false);
  });

  it('notification type là snake_case hợp lệ; guard từ chối giá trị lạ', () => {
    expect(isNotificationType(NOTIFICATION_TYPE.REVIEW_RECEIVED)).toBe(true);
    expect(isNotificationType('booking_created')).toBe(true);
    expect(isNotificationType('unknown_event')).toBe(false);
  });

  it('participant type guard từ chối giá trị lạ', () => {
    expect(isParticipantType('customer')).toBe(true);
    expect(isParticipantType('shop_member')).toBe(true);
    expect(isParticipantType('robot')).toBe(false);
  });
});

describe('ADR 0006 — trạng thái chiếm lịch', () => {
  it('chỉ reserved/confirmed/active mới giữ chỗ trên lịch', () => {
    expect([...BOOKING_STATUS_OCCUPYING].sort()).toEqual(['active', 'confirmed', 'reserved']);
  });

  it('completed/cancelled/no_show giải phóng lịch', () => {
    expect(occupiesSchedule(BOOKING_STATUS.COMPLETED)).toBe(false);
    expect(occupiesSchedule(BOOKING_STATUS.CANCELLED)).toBe(false);
    expect(occupiesSchedule(BOOKING_STATUS.NO_SHOW)).toBe(false);
  });
});

describe('booking state machine', () => {
  it('cho phép reserved → confirmed → active → completed', () => {
    expect(canTransitionBooking(BOOKING_STATUS.RESERVED, BOOKING_STATUS.CONFIRMED)).toBe(true);
    expect(canTransitionBooking(BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACTIVE)).toBe(true);
    expect(canTransitionBooking(BOOKING_STATUS.ACTIVE, BOOKING_STATUS.COMPLETED)).toBe(true);
  });

  it('không cho nhảy cóc reserved → completed', () => {
    expect(canTransitionBooking(BOOKING_STATUS.RESERVED, BOOKING_STATUS.COMPLETED)).toBe(false);
  });

  it('trạng thái kết thúc không đi tiếp được', () => {
    expect(canTransitionBooking(BOOKING_STATUS.COMPLETED, BOOKING_STATUS.ACTIVE)).toBe(false);
    expect(canTransitionBooking(BOOKING_STATUS.CANCELLED, BOOKING_STATUS.RESERVED)).toBe(false);
  });

  it('không huỷ được đơn đang thuê — phải hoàn thành', () => {
    expect(canTransitionBooking(BOOKING_STATUS.ACTIVE, BOOKING_STATUS.CANCELLED)).toBe(false);
  });

  /**
   * Wave 12 — `isBookingFinal` là cổng khoá GHI cho đơn đã khép. Nó SUY từ bảng chuyển trạng
   * thái nên không thể lệch: thêm một trạng thái kết thúc mới sẽ tự động được tính vào.
   */
  it('isBookingFinal đúng với ba trạng thái không còn đường đi tiếp', () => {
    expect(isBookingFinal(BOOKING_STATUS.COMPLETED)).toBe(true);
    expect(isBookingFinal(BOOKING_STATUS.CANCELLED)).toBe(true);
    expect(isBookingFinal(BOOKING_STATUS.NO_SHOW)).toBe(true);
  });

  it('đơn còn đường đi tiếp thì chưa khép', () => {
    expect(isBookingFinal(BOOKING_STATUS.RESERVED)).toBe(false);
    expect(isBookingFinal(BOOKING_STATUS.CONFIRMED)).toBe(false);
    expect(isBookingFinal(BOOKING_STATUS.ACTIVE)).toBe(false);
  });

  it('khép = không còn cạnh đi ra; hai cách nói phải luôn khớp nhau', () => {
    for (const status of BOOKING_STATUS_VALUES) {
      const hasExit = BOOKING_STATUS_VALUES.some((to) => canTransitionBooking(status, to));
      expect(isBookingFinal(status)).toBe(!hasExit);
    }
  });
});
