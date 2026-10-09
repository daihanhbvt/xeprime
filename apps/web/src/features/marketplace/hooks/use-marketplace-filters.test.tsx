import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMarketplaceFilters } from './use-marketplace-filters';

/*
 * `useSearchParams` của Next được thay bằng URL thật của jsdom: hook GHI vào `window.history`,
 * nên đọc lại từ đó là đọc đúng thứ trình duyệt đang giữ.
 */
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('useMarketplaceFilters — ghi URL', () => {
  it('hai lần ghi liền nhau CỘNG DỒN — lần sau không xoá lần trước', () => {
    window.history.replaceState(null, '', '/search?vehicleType=car');
    const { result } = renderHook(() => useMarketplaceFilters());

    // Gõ từ khoá rồi bấm chip trước khi component kịp render lại với URL mới.
    result.current.setFilters({ q: 'vinfast' });
    result.current.setFilters({ serviceType: 'self_drive' });

    const params = new URLSearchParams(window.location.search);
    expect(params.get('q')).toBe('vinfast');
    expect(params.get('serviceType')).toBe('self_drive');
    expect(params.get('vehicleType')).toBe('car');
    expect(window.location.pathname).toBe('/search');
  });

  it('không thêm mục lịch sử và không ghi khi URL không đổi', () => {
    window.history.replaceState(null, '', '/search?q=mazda');
    const before = window.history.length;
    const spy = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useMarketplaceFilters());

    result.current.setFilters({ q: 'mazda' });
    expect(spy).not.toHaveBeenCalled();

    result.current.setFilters({ q: undefined });
    expect(window.location.search).toBe('');
    expect(window.history.length).toBe(before);
    spy.mockRestore();
  });
});
