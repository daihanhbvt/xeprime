import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOKING_LIST_PRESET } from '@xeprime/types';

const nav = vi.hoisted(() => ({ query: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/manage/bookings',
  useSearchParams: () => new URLSearchParams(nav.query),
}));

const { useBookingFilters } = await import('./use-booking-filters');

/**
 * Ngăn đang xem là `?preset=`. Link CŨ mang `?status=` (thẻ Tổng quan trước 02/11/2026, bookmark)
 * phải rơi vào đúng ngăn — và không được sống tiếp thành một bộ lọc vô hình không có nút gỡ.
 */
describe('useBookingFilters — ngăn trên URL', () => {
  beforeEach(() => {
    nav.query = '';
  });

  it('đọc `preset` hợp lệ, bỏ qua giá trị lạ', () => {
    nav.query = 'preset=renting';
    expect(renderHook(() => useBookingFilters()).result.current.filters.preset).toBe(
      BOOKING_LIST_PRESET.RENTING,
    );
    nav.query = 'preset=bogus';
    expect(renderHook(() => useBookingFilters()).result.current.filters.preset).toBeUndefined();
  });

  it.each([
    ['active', BOOKING_LIST_PRESET.RENTING],
    ['completed', BOOKING_LIST_PRESET.COMPLETED],
    ['reserved', BOOKING_LIST_PRESET.AWAITING_PICKUP],
    ['no_show', BOOKING_LIST_PRESET.CANCELLED],
  ])('link cũ ?status=%s → ngăn %s, không gửi `status`', (status, preset) => {
    nav.query = `status=${status}&sort=return_asc`;
    const { filters } = renderHook(() => useBookingFilters()).result.current;
    expect(filters.preset).toBe(preset);
    expect(filters.status).toBeUndefined();
    expect(filters.sort).toBe('return_asc');
  });

  it('`preset` tường minh thắng `status` cũ', () => {
    nav.query = 'preset=completed&status=active';
    expect(renderHook(() => useBookingFilters()).result.current.filters.preset).toBe(
      BOOKING_LIST_PRESET.COMPLETED,
    );
  });
});
