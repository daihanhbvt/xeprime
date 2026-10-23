import { describe, expect, it } from 'vitest';
import {
  BOOKING_REQUEST_REMINDER_REMAINING_MINUTES,
  BOOKING_REQUEST_RESPOND_WINDOW,
  bookingRequestRemainingMs,
  bookingRequestRespondBy,
  bookingRequestRespondWindowMinutes,
  isBookingRequestPastDue,
} from './booking-request';

/**
 * Hạn phản hồi ĐỘNG của gian hàng — ADR 0066: `clamp(round(ΔT × 20%), 15′, 240′)` với
 * `ΔT = pickupAt − createdAt`; không có giờ nhận (dài hạn) ⇒ 240′.
 */
describe('hạn phản hồi động (ADR 0066)', () => {
  const createdAt = new Date('2026-10-22T03:00:00.000Z');
  const after = (minutes: number) => new Date(createdAt.getTime() + minutes * 60_000);

  it.each([
    { label: '3 ngày', lead: 72 * 60, window: 240 },
    { label: '24 giờ', lead: 24 * 60, window: 240 },
    { label: '20 giờ', lead: 20 * 60, window: 240 },
    { label: '19 giờ', lead: 19 * 60, window: 228 },
    { label: '10 giờ', lead: 10 * 60, window: 120 },
    { label: '2 giờ', lead: 120, window: 24 },
    { label: '30 phút', lead: 30, window: 15 },
    { label: '0 phút', lead: 0, window: 15 },
  ])('ΔT = $label ⇒ $window′', ({ lead, window }) => {
    expect(bookingRequestRespondWindowMinutes(createdAt, after(lead))).toBe(window);
    expect(bookingRequestRespondBy(createdAt, after(lead)).getTime()).toBe(
      createdAt.getTime() + window * 60_000,
    );
  });

  it('yêu cầu dài hạn chưa có giờ nhận (null / bỏ trống) ⇒ trọn trần 240′', () => {
    expect(bookingRequestRespondWindowMinutes(createdAt, null)).toBe(240);
    expect(bookingRequestRespondWindowMinutes(createdAt)).toBe(240);
    expect(bookingRequestRespondBy(createdAt).toISOString()).toBe('2026-10-22T07:00:00.000Z');
  });

  it('biên làm tròn của sàn và trần', () => {
    // 75′ × 20% = 15 · 78′ × 20% = 15,6 ⇒ 16.
    expect(bookingRequestRespondWindowMinutes(createdAt, after(75))).toBe(15);
    expect(bookingRequestRespondWindowMinutes(createdAt, after(78))).toBe(16);
    // 1.195′ × 20% = 239 · 1.198′ × 20% = 239,6 ⇒ 240.
    expect(bookingRequestRespondWindowMinutes(createdAt, after(1195))).toBe(239);
    expect(bookingRequestRespondWindowMinutes(createdAt, after(1198))).toBe(240);
  });

  it('giờ nhận đã qua ⇒ ΔT coi như 0, vẫn có sàn 15′ (không kẹp theo giờ nhận)', () => {
    expect(bookingRequestRespondWindowMinutes(createdAt, after(-60))).toBe(
      BOOKING_REQUEST_RESPOND_WINDOW.MIN_MINUTES,
    );
  });

  it('hai mốc nhắc tính theo phần CÒN LẠI, nằm trong trần và giảm dần', () => {
    const { FIRST, FINAL } = BOOKING_REQUEST_REMINDER_REMAINING_MINUTES;
    expect(FIRST).toBeLessThan(BOOKING_REQUEST_RESPOND_WINDOW.MAX_MINUTES);
    expect(FINAL).toBeLessThan(FIRST);
    expect(FINAL).toBeGreaterThan(0);
  });

  it('quá hạn so MỐC, không so trạng thái', () => {
    const respondBy = bookingRequestRespondBy(createdAt, after(120)); // 24′
    expect(isBookingRequestPastDue(respondBy, after(23))).toBe(false);
    expect(isBookingRequestPastDue(respondBy, after(24))).toBe(true);
    expect(bookingRequestRemainingMs(respondBy, after(20))).toBe(4 * 60_000);
    expect(bookingRequestRemainingMs(respondBy, after(30))).toBe(0);
  });
});
