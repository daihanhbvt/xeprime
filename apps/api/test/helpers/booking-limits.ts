import { BOOKING_LIMITS_BOUNDS, type BookingLimits } from '@xeprime/types';
import { PricingService } from '../../src/modules/pricing/pricing.service';

/** Trần rộng nhất DB cho phép — đủ cho mọi lịch spec rải theo bộ đếm ngày. */
export const RELAXED_BOOKING_LIMITS: BookingLimits = {
  maxAdvanceBookingDays: BOOKING_LIMITS_BOUNDS.maxAdvanceBookingDays.max,
  selfDriveMaxDays: BOOKING_LIMITS_BOUNDS.selfDriveMaxDays.max,
};

/**
 * Nới trần thời gian đặt xe (ADR 0091 điều 4) cho spec ĐẶT XE không phải spec của chính trần đó —
 * cùng lý do cổng bằng lái mặc định tắt ở `makeBookingRequestsService`: các spec này rải lịch theo bộ
 * đếm ngày (ngày 3, 4, 5…) để các test không trùng lịch, và vượt 15 ngày khi chạy đủ bộ.
 *
 * Gọi trong \`beforeAll\`/\`beforeEach\` của spec; spec của trần gọi \`restore()\` để chạy luật thật.
 */
export function relaxBookingLimits(): jest.SpyInstance {
  return jest
    .spyOn(PricingService.prototype, 'bookingLimits')
    .mockResolvedValue({ ...RELAXED_BOOKING_LIMITS });
}
