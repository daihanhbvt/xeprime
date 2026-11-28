import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import type { CatalogItem, CatalogMap } from '@/features/catalog/types';
import type { MarketplaceFilters, PublicDestination } from '../types';

/**
 * Hộp "Bộ lọc" của `/search` (design 28/11/2026): lựa chọn là NHÁP tới khi bấm "Xem kết quả",
 * viên lọc nhanh là lối tắt của CHÍNH tiêu chí bên dưới, khay hành trình chỉ ghi khi bấm
 * "Cập nhật hành trình", và sắp xếp không còn nằm trong hộp (đã về danh sách).
 */

const DESTINATIONS: PublicDestination[] = [
  { provinceCode: '79', provinceName: 'TP. Hồ Chí Minh', vehicleCount: 120 },
  { provinceCode: '01', provinceName: 'Hà Nội', vehicleCount: 80 },
  { provinceCode: '48', provinceName: 'Đà Nẵng', vehicleCount: 42 },
];

const BRANDS = [
  'Toyota',
  'Hyundai',
  'Mercedes',
  'BMW',
  'Audi',
  'Volvo',
  'Mitsubishi',
  'Kia',
  'VinFast',
  'Mazda',
].map(
  (label) =>
    ({
      id: label,
      type: 'vehicle_brand',
      key: label.toLowerCase(),
      label,
      labelEn: null,
      description: null,
      descriptionEn: null,
      iconUrl: null,
      vehicleTypes: [],
    }) as unknown as CatalogItem,
);

const CATALOG: CatalogMap = {
  vehicle_brand: BRANDS,
  body_type: [],
  fuel_type: [],
  vehicle_feature: [],
};

const nav = vi.hoisted(() => ({
  setFilters: vi.fn(),
  filters: {} as MarketplaceFilters,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/search',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../hooks/use-marketplace-filters', () => ({
  useMarketplaceFilters: () => ({ filters: nav.filters, setFilters: nav.setFilters }),
}));

vi.mock('../hooks/use-destinations', () => ({
  useDestinations: () => ({ data: DESTINATIONS, isLoading: false, error: null }),
  useAllDestinations: () => ({ data: DESTINATIONS, isLoading: false, error: null }),
}));

vi.mock('@/features/catalog/use-catalog', () => ({
  useCatalog: () => ({ catalog: CATALOG, isLoading: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => false }));

beforeEach(() => {
  nav.setFilters = vi.fn();
  nav.filters = { vehicleType: VEHICLE_TYPE.CAR, serviceType: SERVICE_TYPE.SELF_DRIVE };
});

afterEach(cleanup);

async function renderModal(onClose = vi.fn()) {
  const { SearchExperienceProvider } = await import('../search/search-context');
  const { FilterModal } = await import('./FilterModal');
  render(
    <SearchExperienceProvider>
      <FilterModal open onClose={onClose} />
    </SearchExperienceProvider>,
  );
  return { dialog: screen.getByRole('dialog'), onClose };
}

function lastPatch(): Partial<MarketplaceFilters> {
  return (nav.setFilters.mock.calls.at(-1)?.[0] ?? {}) as Partial<MarketplaceFilters>;
}

describe('hộp Bộ lọc /search', () => {
  it('chọn là nháp - chỉ "Xem kết quả" mới ghi URL, và không còn đụng tới sắp xếp', async () => {
    const { dialog, onClose } = await renderModal();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Tự động duyệt' }));
    expect(nav.setFilters).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /Xem kết quả/ }));
    expect(lastPatch().instantBook).toBe(true);
    expect('sort' in lastPatch()).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('viên "Chủ xe 4.8+" là lối tắt của mức đánh giá cao nhất - cùng một state', async () => {
    const { dialog } = await renderModal();

    const quick = within(dialog).getByRole('button', { name: /Chủ xe 4,8\+/ });
    fireEvent.click(quick);

    expect(quick.getAttribute('aria-pressed')).toBe('true');
    expect(
      within(dialog)
        .getByRole('button', { name: /^Từ 4,8/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');

    fireEvent.click(within(dialog).getByRole('button', { name: /Xem kết quả/ }));
    expect(lastPatch().minRating).toBe(4.8);
  });

  it('hãng xe: 8 viên + "+N hãng xe khác"; ô tìm nhanh lọc không phân biệt hoa thường', async () => {
    const { dialog } = await renderModal();

    expect(within(dialog).queryByRole('button', { name: 'VinFast' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: '+2 hãng xe khác' })).toBeTruthy();

    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Tìm nhanh hãng xe' }), {
      target: { value: 'vin' },
    });

    expect(within(dialog).getByRole('button', { name: 'VinFast' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Toyota' })).toBeNull();
  });

  it('khay hành trình: "Hủy" không ghi gì, "Cập nhật hành trình" ghi một lượt và dọn tiêu chí ô tô', async () => {
    const { dialog } = await renderModal();

    fireEvent.click(within(dialog).getByRole('button', { name: /^Hành trình:/ }));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Xe máy' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(nav.setFilters).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /^Hành trình:/ }));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Xe máy' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hà Nội' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cập nhật hành trình' }));

    // Lượt ghi của khay là lượt mang `seats` (URL giả ở đây không đổi, nên effect đồng bộ nháp →
    // URL của ngữ cảnh còn ghi thêm một lượt sau; URL thật thì chữ ký khớp và không ghi lại).
    const patch = (nav.setFilters.mock.calls.find(([p]) => 'seats' in (p as object))?.[0] ??
      {}) as Partial<MarketplaceFilters>;
    expect(patch.vehicleType).toBe(VEHICLE_TYPE.MOTORBIKE);
    expect(patch.provinceCode).toBe('01');
    expect('seats' in patch && patch.seats === undefined).toBe(true);
    expect('bodyType' in patch && patch.bodyType === undefined).toBe(true);
    // Khay đóng lại, tiêu chí bên dưới đổi sang xe máy ngay.
    expect(within(dialog).queryByRole('button', { name: 'Cập nhật hành trình' })).toBeNull();
    expect(within(dialog).getByText('Truyền động')).toBeTruthy();
  });

  it('dài hạn: viên nói gói + ngày nhận, khay có ngày nhận + gói, "Cập nhật" giữ lựa chọn đó', async () => {
    nav.filters = {
      vehicleType: VEHICLE_TYPE.CAR,
      serviceType: SERVICE_TYPE.LONG_TERM,
      ltFrom: '2099-01-15',
      ltMonths: 2,
    };
    const { dialog } = await renderModal();

    const pill = within(dialog).getByRole('button', { name: /^Hành trình:/ });
    expect(pill.textContent).toContain('2 tháng từ 15/01/2099');
    // Giá dài hạn theo THÁNG: tiêu đề, mốc và đơn vị đều theo tháng.
    expect(within(dialog).getByText('Khoảng giá thuê theo tháng')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Dưới 10tr' })).toBeTruthy();
    expect(within(dialog).getAllByText(/\/tháng/).length).toBeGreaterThan(0);

    fireEvent.click(pill);
    expect(within(dialog).getByText('Thời gian nhận xe')).toBeTruthy();
    expect(within(dialog).getByText('Thời gian thuê')).toBeTruthy();
    // Ngày trả dự kiến = 2 tháng LỊCH (ADR 0011).
    expect(within(dialog).getByText('đến 15/03/2099')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Hà Nội' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cập nhật hành trình' }));

    const patch = (nav.setFilters.mock.calls.find(
      ([p]) => 'motorbikeCategory' in (p as object),
    )?.[0] ?? {}) as Partial<MarketplaceFilters>;
    expect(patch.provinceCode).toBe('01');
    expect(patch.ltFrom).toBe('2099-01-15');
    expect(patch.ltMonths).toBe(2);
    expect(patch.pickupAt).toBeUndefined();
  });

  it('Esc thu khay hành trình trước, lần sau mới đóng hộp', async () => {
    const { dialog, onClose } = await renderModal();

    fireEvent.click(within(dialog).getByRole('button', { name: /^Hành trình:/ }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(within(dialog).queryByRole('button', { name: 'Cập nhật hành trình' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
