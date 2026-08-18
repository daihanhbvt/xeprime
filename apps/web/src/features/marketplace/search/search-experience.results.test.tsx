import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import type { MarketplaceFilters, PublicDestination } from '../types';

/**
 * `StickySearchOnly` — cụm tìm kiếm thu gọn mượn cho TRANG KẾT QUẢ.
 *
 * `/search` giữ nguyên thanh ngữ cảnh + hộp "Chỉnh sửa" của nó; cụm này chỉ bung ra khi thanh
 * gốc đã cuộn khuất. Ba điều phải đúng:
 *   1. không đụng gì tới bộ tìm kiếm sẵn có, và không hiện khi thanh gốc còn thấy;
 *   2. sửa ở đây LỌC TẠI CHỖ (ghi filter), không điều hướng sang trang khác;
 *   3. facet của panel Bộ lọc không bị thao tác tìm kiếm cuốn trôi, và mở trang không tự ghi gì.
 */

const DESTINATIONS: PublicDestination[] = [
  { provinceCode: '48', provinceName: 'Đà Nẵng', vehicleCount: 42 },
];

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  setFilters: vi.fn(),
  filters: {} as MarketplaceFilters,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  usePathname: () => '/search',
  useSearchParams: () => new URLSearchParams(),
}));

// Hook filter thật đọc `useSearchParams`; ở đây cần quan sát ĐÚNG patch mà cụm thu gọn phát ra.
vi.mock('../hooks/use-marketplace-filters', () => ({
  useMarketplaceFilters: () => ({ filters: nav.filters, setFilters: nav.setFilters }),
}));

vi.mock('../hooks/use-destinations', () => ({
  useDestinations: () => ({ data: DESTINATIONS, isLoading: false, error: null }),
}));

vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => false }));

const observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];

class TestIntersectionObserver {
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    observers.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const realIntersectionObserver = window.IntersectionObserver;

beforeEach(() => {
  nav.push.mockClear();
  nav.setFilters = vi.fn();
  nav.filters = { vehicleType: VEHICLE_TYPE.CAR, serviceType: SERVICE_TYPE.SELF_DRIVE };
  observers.length = 0;
  window.IntersectionObserver = TestIntersectionObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  cleanup();
  window.IntersectionObserver = realIntersectionObserver;
});

/** Bộ tìm kiếm SẴN CÓ của trang kết quả — cụm thu gọn quấn quanh nó, không thay nó. */
const EXISTING_SEARCH_BAR = <button type="button">Chỉnh sửa tìm kiếm</button>;

async function renderResultsSearch() {
  const { StickySearchOnly } = await import('./SearchExperience');
  render(<StickySearchOnly>{EXISTING_SEARCH_BAR}</StickySearchOnly>);
}

async function scrollSearchBarOutOfView() {
  await act(async () => {
    for (const notify of observers) notify([{ isIntersecting: false }]);
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

function sticky(): HTMLElement {
  return screen.getByRole('search', { name: 'Tìm kiếm nhanh' });
}

/** Patch của lần ghi filter gần nhất. */
function lastPatch(): Partial<MarketplaceFilters> {
  return (nav.setFilters.mock.calls.at(-1)?.[0] ?? {}) as Partial<MarketplaceFilters>;
}

describe('cụm thu gọn ở trang kết quả', () => {
  it('không đụng bộ tìm kiếm sẵn có, và chỉ bung ra khi bộ đó đã cuộn khuất', async () => {
    await renderResultsSearch();

    expect(screen.getByRole('button', { name: 'Chỉnh sửa tìm kiếm' })).toBeTruthy();
    expect(screen.queryByRole('search', { name: 'Tìm kiếm nhanh' })).toBeNull();

    await scrollSearchBarOutOfView();

    expect(sticky()).toBeTruthy();
    // Thanh gốc vẫn còn nguyên trong DOM — cụm thu gọn không thay thế nó.
    expect(screen.getByRole('button', { name: 'Chỉnh sửa tìm kiếm' })).toBeTruthy();
  });

  it('mở trang KHÔNG tự ghi filter nào — không có gì bị lọc thêm sau lưng người dùng', async () => {
    nav.filters = { bodyType: ['suv'] };
    await renderResultsSearch();
    await scrollSearchBarOutOfView();

    expect(nav.setFilters).not.toHaveBeenCalled();
  });

  it('sửa ở cụm thu gọn lọc TẠI CHỖ, không điều hướng sang trang khác', async () => {
    await renderResultsSearch();
    await scrollSearchBarOutOfView();

    fireEvent.click(within(sticky()).getByRole('button', { name: /Địa điểm nhận xe/ }));
    const panel = screen.getByRole('dialog', { name: 'Bạn muốn thuê xe ở đâu?' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Đà Nẵng' }));

    expect(nav.push).not.toHaveBeenCalled();
    expect(lastPatch().provinceCode).toBe('48');
  });

  it('patch chỉ mang key của thẻ tìm kiếm — facet Bộ lọc không bị cuốn trôi', async () => {
    nav.filters = {
      vehicleType: VEHICLE_TYPE.CAR,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      bodyType: ['suv'],
      priceMin: 500_000,
    };
    await renderResultsSearch();
    await scrollSearchBarOutOfView();

    fireEvent.click(within(sticky()).getByRole('button', { name: /Loại xe và dịch vụ/ }));
    const panel = screen.getByRole('dialog', { name: 'Loại xe và dịch vụ' });
    fireEvent.click(
      within(within(panel).getByRole('tablist', { name: 'Loại xe' })).getByRole('tab', {
        name: 'Xe máy',
      }),
    );

    const patch = lastPatch();
    expect(patch.vehicleType).toBe(VEHICLE_TYPE.MOTORBIKE);
    // Không nhắc tới facet = `applyFilterPatch` giữ nguyên chúng trên URL.
    expect('bodyType' in patch).toBe(false);
    expect('priceMin' in patch).toBe(false);
  });

  it('đổi sang dài hạn ở đây cũng xoá lịch khỏi URL (ADR 0011)', async () => {
    nav.filters = {
      vehicleType: VEHICLE_TYPE.CAR,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      pickupAt: '2026-09-01T03:00:00.000Z',
      returnAt: '2026-09-04T03:00:00.000Z',
    };
    await renderResultsSearch();
    await scrollSearchBarOutOfView();

    fireEvent.click(within(sticky()).getByRole('button', { name: /Loại xe và dịch vụ/ }));
    const panel = screen.getByRole('dialog', { name: 'Loại xe và dịch vụ' });
    fireEvent.click(
      within(within(panel).getByRole('tablist', { name: 'Loại dịch vụ thuê xe' })).getByRole(
        'tab',
        { name: 'Thuê xe dài hạn' },
      ),
    );

    const patch = lastPatch();
    expect(patch.serviceType).toBe(SERVICE_TYPE.LONG_TERM);
    expect(patch.pickupAt).toBeUndefined();
    expect(patch.returnAt).toBeUndefined();
    expect('pickupAt' in patch).toBe(true); // `undefined` = tín hiệu XOÁ, không phải bỏ quên
  });
});
