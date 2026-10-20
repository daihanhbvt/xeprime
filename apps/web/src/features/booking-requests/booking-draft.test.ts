import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toAppTz } from '@/lib/datetime';
import {
  bookingDraftSavedAt,
  clearBookingDraft,
  hasBookingDraft,
  readBookingDraft,
  saveBookingDraft,
} from './booking-draft';
import { PICKUP_METHOD, type RequestFormValues } from './schema';

/**
 * Bản nháp yêu cầu thuê giữ qua lượt đăng nhập (ADR 0060 §7). Ba điều khoá ở đây: nó KHÔNG mang
 * lời đồng ý điều khoản của người trước, nó trả mốc ghi để nơi đọc so với `/auth/me`, và nó hết
 * hạn sau 30 phút.
 */
function values(overrides: Partial<RequestFormValues> = {}): RequestFormValues {
  return {
    serviceType: 'self_drive',
    routeType: 'in_city',
    pickupMethod: PICKUP_METHOD.SELF,
    pickupAt: toAppTz('2026-12-10T02:00:00.000Z'),
    returnAt: toAppTz('2026-12-13T02:00:00.000Z'),
    requestedPickupDate: null,
    ...overrides,
  } as RequestFormValues;
}

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.useRealTimers());

describe('booking-draft', () => {
  it('KHÔNG lưu ô đồng ý điều khoản — khôi phục xong ô đó luôn trống', () => {
    saveBookingDraft('V1', {
      values: values({ acceptedTerms: true }),
      rentalMode: 'daily',
      promoCode: null,
    });

    expect(window.sessionStorage.getItem('xp.bookingDraft.v1')).not.toContain('acceptedTerms');
    expect(readBookingDraft('V1')?.values.acceptedTerms).toBe(false);
  });

  it('trả mốc GHI để so với `/auth/me`, và giữ đúng ngày giờ đã chọn', () => {
    vi.useFakeTimers({ now: new Date('2026-10-14T03:00:00.000Z') });
    saveBookingDraft('V1', { values: values(), rentalMode: 'hourly', promoCode: 'GIAM50' });

    const draft = readBookingDraft('V1');
    expect(draft?.savedAt).toBe(Date.parse('2026-10-14T03:00:00.000Z'));
    expect(bookingDraftSavedAt('V1')).toBe(draft?.savedAt);
    expect(draft?.rentalMode).toBe('hourly');
    expect(draft?.promoCode).toBe('GIAM50');
    expect(draft?.values.pickupAt?.toISOString()).toBe('2026-12-10T02:00:00.000Z');
  });

  it('một bản cho một xe: bản của xe khác là "không có"', () => {
    saveBookingDraft('V2', { values: values(), rentalMode: 'daily', promoCode: null });

    expect(readBookingDraft('V1')).toBeNull();
    expect(bookingDraftSavedAt('V1')).toBeNull();
    expect(hasBookingDraft('V2')).toBe(true);
  });

  it('quá 30 phút thì bỏ — giá và lịch trống đã có thể khác', () => {
    vi.useFakeTimers({ now: new Date('2026-10-14T03:00:00.000Z') });
    saveBookingDraft('V1', { values: values(), rentalMode: 'daily', promoCode: null });

    vi.setSystemTime(new Date('2026-10-14T03:30:01.000Z'));
    expect(readBookingDraft('V1')).toBeNull();
    expect(window.sessionStorage.getItem('xp.bookingDraft.v1')).toBeNull();
  });

  it('giữ LỜI NHẮN cho chủ xe qua lượt đăng nhập', () => {
    saveBookingDraft('V1', {
      values: values({ note: 'Tôi cần hướng dẫn nhận xe' }),
      rentalMode: 'daily',
      promoCode: null,
    });
    expect(readBookingDraft('V1')?.values.note).toBe('Tôi cần hướng dẫn nhận xe');
  });

  it('bản nháp ghi trước khi form có ô lời nhắn ⇒ khôi phục với lời nhắn rỗng, không `undefined`', () => {
    // Đúng hình dạng một bản nháp cũ trong sessionStorage: không có khoá `note`.
    saveBookingDraft('V1', { values: values(), rentalMode: 'daily', promoCode: null });
    expect(window.sessionStorage.getItem('xp.bookingDraft.v1')).not.toContain('"note"');
    expect(readBookingDraft('V1')?.values.note).toBe('');
  });

  it('xoá là xoá hẳn', () => {
    saveBookingDraft('V1', { values: values(), rentalMode: 'daily', promoCode: null });
    clearBookingDraft();
    expect(hasBookingDraft('V1')).toBe(false);
  });
});
