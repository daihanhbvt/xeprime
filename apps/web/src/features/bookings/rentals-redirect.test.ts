import { describe, expect, it } from 'vitest';
import { legacyEndedBookingsTarget, legacyRequestsTarget } from './rentals-redirect';

const PATHS = { bookings: '/manage/bookings', ended: '/manage/bookings/ended' };

/**
 * Link CŨ sau khi gộp "Yêu cầu đặt xe" + "Quản lý đơn thuê xe" (05/11/2026) — email, thông báo,
 * bookmark không được chết, và bộ lọc người dùng đã chọn đi theo.
 */
describe('legacyRequestsTarget — hộp thư yêu cầu cũ', () => {
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

  it('mã lạ (`status=all` của link rất cũ) không làm vỡ — về Cần xử lý', () => {
    expect(legacyRequestsTarget({ status: 'all' }, PATHS)).toBe(
      '/manage/bookings?preset=needs_action',
    );
  });
});

describe('legacyEndedBookingsTarget — ngăn đã kết thúc của bảng đơn cũ', () => {
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
