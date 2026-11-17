import { describe, expect, it } from 'vitest';
import {
  BOOKING_LIMIT_VIOLATION,
  BOOKING_LIMITS_DEFAULTS,
  bookingLimitsValid,
  bookingLimitViolation,
  lastBookablePickupDateKey,
} from './booking-limits';
import { SERVICE_TYPE } from './status/vehicle';

/** 16/11/2026 22:00 giờ VN = 15:00 UTC. */
const NOW = new Date('2026-11-16T15:00:00.000Z');
const limits = BOOKING_LIMITS_DEFAULTS;
const hours = (h: number) => h * 3_600_000;

describe('lastBookablePickupDateKey', () => {
  it('đếm theo NGÀY LỊCH giờ Việt Nam, không theo 24 giờ từ lúc gửi', () => {
    expect(lastBookablePickupDateKey(NOW, limits)).toBe('2026-12-01');
    // 23:30 giờ VN vẫn là ngày 16 — chưa sang ngày mới.
    expect(lastBookablePickupDateKey(new Date('2026-11-16T16:30:00.000Z'), limits)).toBe(
      '2026-12-01',
    );
    // 00:30 giờ VN ngày 17 — mốc lùi thêm một ngày.
    expect(lastBookablePickupDateKey(new Date('2026-11-16T17:30:00.000Z'), limits)).toBe(
      '2026-12-02',
    );
  });
});

describe('bookingLimitViolation', () => {
  const pickupOn = (dateKeyUtcIso: string) => new Date(dateKeyUtcIso);

  it('nhận đúng ngày cuối cùng, chặn ngày kế tiếp', () => {
    // 01/12 23:00 giờ VN = 01/12 16:00 UTC.
    const lastDay = pickupOn('2026-12-01T16:00:00.000Z');
    expect(
      bookingLimitViolation({
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        now: NOW,
        pickupAt: lastDay,
        returnAt: new Date(lastDay.getTime() + hours(24)),
        limits,
      }),
    ).toBeNull();
    // 02/12 00:00 giờ VN = 01/12 17:00 UTC.
    const nextDay = pickupOn('2026-12-01T17:00:00.000Z');
    expect(
      bookingLimitViolation({
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        now: NOW,
        pickupAt: nextDay,
        returnAt: new Date(nextDay.getTime() + hours(24)),
        limits,
      }),
    ).toBe(BOOKING_LIMIT_VIOLATION.TOO_FAR_AHEAD);
  });

  it('thuê dài hạn không chịu trần đặt trước hay trần độ dài', () => {
    const far = pickupOn('2027-02-01T02:00:00.000Z');
    expect(
      bookingLimitViolation({
        serviceType: SERVICE_TYPE.LONG_TERM,
        now: NOW,
        pickupAt: far,
        returnAt: new Date(far.getTime() + hours(24 * 90)),
        limits,
      }),
    ).toBeNull();
  });

  it('tự lái đúng 30 × 24 giờ còn được, quá một phút là chặn', () => {
    const pickupAt = pickupOn('2026-11-18T02:00:00.000Z');
    expect(
      bookingLimitViolation({
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        now: NOW,
        pickupAt,
        returnAt: new Date(pickupAt.getTime() + hours(24 * 30)),
        limits,
      }),
    ).toBeNull();
    expect(
      bookingLimitViolation({
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        now: NOW,
        pickupAt,
        returnAt: new Date(pickupAt.getTime() + hours(24 * 30) + 60_000),
        limits,
      }),
    ).toBe(BOOKING_LIMIT_VIOLATION.SELF_DRIVE_TOO_LONG);
  });

  it('có tài xế không có trần độ dài', () => {
    const pickupAt = pickupOn('2026-11-18T02:00:00.000Z');
    expect(
      bookingLimitViolation({
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        now: NOW,
        pickupAt,
        returnAt: new Date(pickupAt.getTime() + hours(24 * 45)),
        limits,
      }),
    ).toBeNull();
  });

  it('thiếu giờ nhận thì không có gì để kiểm', () => {
    expect(
      bookingLimitViolation({
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        now: NOW,
        pickupAt: null,
        returnAt: null,
        limits,
      }),
    ).toBeNull();
  });
});

describe('bookingLimitsValid', () => {
  it('khớp CHECK ở DB', () => {
    expect(bookingLimitsValid({ maxAdvanceBookingDays: 15, selfDriveMaxDays: 30 })).toBe(true);
    expect(bookingLimitsValid({ maxAdvanceBookingDays: 0, selfDriveMaxDays: 30 })).toBe(false);
    expect(bookingLimitsValid({ maxAdvanceBookingDays: 15, selfDriveMaxDays: 91 })).toBe(false);
    expect(bookingLimitsValid({ maxAdvanceBookingDays: 1.5, selfDriveMaxDays: 30 })).toBe(false);
  });
});
