import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketplaceFilters, PublicListingFacets } from '../types';
import { FilterPanel } from './FilterPanel';

/**
 * FilterPanel giữ DRAFT cục bộ: bấm chip không được ghi URL; chỉ "Áp dụng (N xe)" mới gọi
 * setFilters đúng MỘT lần với patch đầy đủ; "Xoá bộ lọc" reset các chiều panel sở hữu nhưng
 * không đụng ngữ cảnh tìm kiếm (q/province/ngày giờ).
 */

const FACETS: PublicListingFacets = {
  total: 14,
  price: { min: '400000', max: '1500000' },
  bodyType: [
    { key: 'sedan', count: 3 },
    { key: 'suv', count: 2 },
  ],
  brand: [
    { key: 'Toyota', count: 5 },
    { key: 'Kia', count: 2 },
  ],
  seats: [
    { key: '4', count: 3 },
    { key: '5', count: 10 },
  ],
  fuelType: [{ key: 'gasoline', count: 8 }],
  features: [{ key: 'bluetooth', count: 4 }],
  amenities: { hourly: 13, delivery: 14, noCollateral: 2, discount: 1 },
};

const state = vi.hoisted(() => ({
  filters: {} as MarketplaceFilters,
  setFilters: vi.fn(),
}));

vi.mock('../hooks/use-marketplace-filters', () => ({
  useMarketplaceFilters: () => ({ filters: state.filters, setFilters: state.setFilters }),
}));
vi.mock('../hooks/use-listing-facets', () => ({
  useListingFacets: () => ({ data: FACETS, isFetching: false }),
}));
// Desktop (Modal) — tránh phụ thuộc matchMedia của hook thật trong jsdom.
vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => false }));

// Polyfill matchMedia của AntD nằm ở `vitest.setup.ts` (dùng chung cho mọi test).

beforeEach(() => {
  state.filters = {};
  state.setFilters = vi.fn();
});

// Vitest không bật globals → RTL không tự cleanup; Modal portal sẽ dồn DOM giữa các test.
afterEach(cleanup);

describe('FilterPanel', () => {
  it('hiện tổng số xe thật trên nút Áp dụng', () => {
    render(<FilterPanel open onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Áp dụng \(14 xe\)/ })).toBeTruthy();
  });

  it('bấm chip chỉ đổi draft — KHÔNG ghi URL; Áp dụng mới gọi setFilters một lần rồi đóng', async () => {
    const onClose = vi.fn();
    render(<FilterPanel open onClose={onClose} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Sedan/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Toyota/ }));
    expect(state.setFilters).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Áp dụng/ }));
    await waitFor(() => expect(state.setFilters).toHaveBeenCalledTimes(1));
    expect(state.setFilters).toHaveBeenCalledWith(
      expect.objectContaining({ bodyType: ['sedan'], brand: ['Toyota'] }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mở panel nạp draft từ URL; Xoá bộ lọc reset chiều panel nhưng patch không đụng q', async () => {
    state.filters = { bodyType: ['sedan'], discount: true, q: 'vios' };
    render(<FilterPanel open onClose={vi.fn()} />);

    // Draft nạp từ URL: chip Sedan đang chọn.
    expect(screen.getByRole('checkbox', { name: /Sedan/ }).getAttribute('aria-checked')).toBe(
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /Xoá bộ lọc/ }));
    fireEvent.click(screen.getByRole('button', { name: /Áp dụng/ }));

    await waitFor(() => expect(state.setFilters).toHaveBeenCalledTimes(1));
    const patch = state.setFilters.mock.calls[0]?.[0] as Partial<MarketplaceFilters>;
    expect(patch.bodyType).toEqual([]); // mảng rỗng → applyFilterPatch xoá param
    expect(patch.discount).toBe(false);
    expect('q' in patch).toBe(false); // ngữ cảnh tìm kiếm không thuộc panel — giữ nguyên
  });

  it('ẩn mục Loại xe khi đang tab xe máy (body type chỉ có nghĩa với ô tô)', () => {
    state.filters = { vehicleType: 'motorbike' };
    render(<FilterPanel open onClose={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: /Sedan/ })).toBeNull();
  });
});
