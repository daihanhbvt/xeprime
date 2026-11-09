import { describe, expect, it } from 'vitest';
import {
  legacyEndedBookingsTarget,
  legacyOwnerTripsTarget,
  legacyRequestsTarget,
} from './rentals-redirect';

const PATHS = { bookings: '/manage/bookings', ended: '/manage/bookings/ended' };

/**
 * Link CŨ sau khi gộp "Yêu cầu đặt xe" + "Quản lý đơn thuê xe" (05/11/2026) — email, thông báo,
 * bookmark không được chết, và bộ lọc người dùng đã chọn đi theo.
 */
describe('legacyRequestsTarget - hộp thư yêu cầu cũ', () => {
  it('không tham số / tab "Cần xử lý" ⇒ nhóm Cần xử lý', () => {
    expect(legacyRequestsTarget({}, PATHS)).toBe('/manage/bookings?preset=needs_action');
    expect(legacyRequestsTarget({ status: 'needs_action' }, PATHS)).toBe(
      '/manage/bookings?preset=needs_action',
    );
  });

  it('tab "Chờ khách thanh toán" ⇒ nhóm Chờ khách thanh toán, mang theo bộ lọc', () => {
    expect(
      legacyRequestsTarget({ status: 'awaiting_hold', q: 'Vios', branchId: 'B1', page: '3' }, PATHS),
    ).toBe('/manage/bookings?q=Vios&branchId=B1&preset=awaiting_payment');
  });

  it('tab "Đã kết thúc" cũ ⇒ ngăn "Không thành đơn" của màn Đơn đã kết thúc', () => {
    expect(legacyRequestsTarget({ status: 'closed', serviceType: 'self_drive' }, PATHS)).toBe(
      '/manage/bookings/ended?serviceType=self_drive&tab=not_converted',
    );
  });

  it('mã lạ (`status=all` của link rất cũ) không làm vỡ - về Cần xử lý', () => {
    expect(legacyRequestsTarget({ status: 'all' }, PATHS)).toBe(
      '/manage/bookings?preset=needs_action',
    );
  });
});

describe('legacyEndedBookingsTarget - ngăn đã kết thúc của bảng đơn cũ', () => {
  it('`preset=completed|cancelled` ⇒ ngăn tương ứng của màn Đơn đã kết thúc', () => {
    expect(legacyEndedBookingsTarget({ preset: 'completed', q: 'An' }, PATHS)).toBe(
      '/manage/bookings/ended?q=An&tab=completed',
    );
    expect(legacyEndedBookingsTarget({ preset: 'cancelled' }, PATHS)).toBe(
      '/manage/bookings/ended?tab=cancelled',
    );
  });

  it('`status=no_show` (thẻ Tổng quan cũ) ⇒ ngăn Đã huỷ', () => {
    expect(legacyEndedBookingsTarget({ status: 'no_show' }, PATHS)).toBe(
      '/manage/bookings/ended?tab=cancelled',
    );
  });

  it('nhóm còn sống ⇒ ở lại (`null`)', () => {
    expect(legacyEndedBookingsTarget({ preset: 'renting' }, PATHS)).toBeNull();
    expect(legacyEndedBookingsTarget({ preset: 'needs_action' }, PATHS)).toBeNull();
    expect(legacyEndedBookingsTarget({}, PATHS)).toBeNull();
  });
});

/** "Chuyến cho thuê" cũ của chủ xe tuyến hoa hồng (`/trips`) → màn "Đơn thuê xe" (06/11/2026). */
describe('legacyOwnerTripsTarget - "Chuyến cho thuê" cũ', () => {
  it('tab hiện tại (hoặc không tham số) ⇒ màn Đơn thuê xe, mang theo từ khoá', () => {
    expect(legacyOwnerTripsTarget({}, PATHS)).toBe('/manage/bookings');
    expect(legacyOwnerTripsTarget({ filter: 'current', page: '2', q: 'Vios' }, PATHS)).toBe(
      '/manage/bookings?q=Vios',
    );
  });

  it('tab "Lịch sử chuyến" ⇒ màn Đơn đã kết thúc (ô Tất cả)', () => {
    expect(legacyOwnerTripsTarget({ filter: 'history' }, PATHS)).toBe('/manage/bookings/ended');
    expect(
      legacyOwnerTripsTarget({ filter: 'history', q: 'Vios', from: '2026-10-01' }, PATHS),
    ).toBe('/manage/bookings/ended?q=Vios');
  });

  it('`?role=` của bản hai phía rất cũ không làm vỡ', () => {
    expect(legacyOwnerTripsTarget({ role: 'host', filter: ['history', 'current'] }, PATHS)).toBe(
      '/manage/bookings/ended',
    );
  });
});
