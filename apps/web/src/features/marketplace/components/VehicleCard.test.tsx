import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VehicleCard } from './VehicleCard';
import type { PublicListing } from '../types';
import { renderWithIntl as render } from '@/i18n/test-utils';

/**
 * Thẻ xe trên marketplace (Wave 11.1).
 *
 * Điều được khoá: thẻ **không** mở luồng thuê. Thẻ chỉ mang dữ liệu tóm tắt, trong khi quyết
 * định thuê cần giá theo ngày, chính sách cọc và điều kiện giao nhận — tức là trang chi tiết.
 * Cả thẻ là một đường dẫn tới đó, và ngày giờ đang lọc phải đi theo để trang chi tiết prefill.
 */
const filters = vi.hoisted(() => ({
  value: {} as { pickupAt?: string; returnAt?: string },
}));

vi.mock('../hooks/use-marketplace-filters', () => ({
  useMarketplaceFilters: () => ({ filters: filters.value, setFilters: vi.fn() }),
}));

vi.mock('@/features/catalog/use-catalog', () => ({
  useCatalogLabels: () => ({
    brandLabel: (key?: string | null) => key ?? null,
    fuelTypeLabel: (key?: string | null) => key ?? null,
  }),
}));

const LISTING = {
  id: 'V1',
  name: 'Toyota Camry 2024',
  vehicleType: 'car',
  serviceTypes: ['self_drive'],
  brand: 'toyota',
  model: 'Camry',
  seatCount: 5,
  fuelType: 'gasoline',
  mainImageUrl: null,
  weekdayPrice: '1050000',
  discountPercent: null,
  ratingAvg: '4.8',
  ratingCount: 12,
  completedTripCount: 27,
  shopName: 'Gian hàng Minh Tuấn',
  shopSlug: 'minh-tuan',
  shopLogoUrl: null,
  shopProvince: 'Đà Nẵng',
  deliveryEnabled: true,
  noCollateral: false,
} as unknown as PublicListing;

beforeEach(() => {
  filters.value = {};
});

afterEach(cleanup);

function detailLink(): HTMLAnchorElement {
  return screen.getByRole('link', { name: /Xem chi tiết/ }) as HTMLAnchorElement;
}

describe('VehicleCard', () => {
  it('KHÔNG có nút vào luồng thuê', () => {
    render(<VehicleCard listing={LISTING} />);
    expect(screen.queryByRole('button', { name: 'Yêu cầu thuê' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chọn thuê' })).toBeNull();
  });

  it('KHÔNG dựng sẵn modal yêu cầu thuê trong lưới', () => {
    // Mỗi thẻ mang theo một modal là hàng chục overlay ẩn trên một trang kết quả tìm kiếm.
    render(<VehicleCard listing={LISTING} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Yêu cầu thuê xe')).toBeNull();
  });

  it('nút duy nhất còn lại là lưu xe — không phải hành động thuê', () => {
    render(<VehicleCard listing={LISTING} />);
    const labels = screen.getAllByRole('button').map((btn) => btn.getAttribute('aria-label'));
    expect(labels).toEqual(['Lưu xe']);
  });

  it('cả thẻ dẫn tới trang chi tiết xe, mang theo dịch vụ đang active (17/08)', () => {
    render(<VehicleCard listing={LISTING} />);
    // Card và detail không bao giờ nói hai dịch vụ khác nhau — link luôn mang activeService.
    expect(detailLink().getAttribute('href')).toBe('/listings/V1?serviceType=self_drive');
  });

  it('mang theo pickupAt/returnAt đang lọc sang trang chi tiết', () => {
    filters.value = { pickupAt: '2026-08-09T14:00', returnAt: '2026-08-12T14:00' };
    render(<VehicleCard listing={LISTING} />);

    const href = detailLink().getAttribute('href') ?? '';
    const [path, qs] = href.split('?');
    expect(path).toBe('/listings/V1');
    const params = new URLSearchParams(qs);
    expect(params.get('pickupAt')).toBe('2026-08-09T14:00');
    expect(params.get('returnAt')).toBe('2026-08-12T14:00');
  });

  it('liên kết gian hàng vẫn còn', () => {
    render(<VehicleCard listing={LISTING} />);
    expect(screen.getByRole('link', { name: 'Gian hàng Minh Tuấn' }).getAttribute('href')).toBe(
      '/shops/minh-tuan',
    );
  });

  it('hiển thị điểm xe, số chuyến thật và nhận diện gian hàng ở chân thẻ', () => {
    render(<VehicleCard listing={LISTING} />);
    expect(screen.getByText('4,8')).toBeTruthy();
    expect(screen.getByText('27 chuyến')).toBeTruthy();
    expect(screen.getByText('Chủ xe')).toBeTruthy();
    expect(screen.getByText('Gian hàng Minh Tuấn')).toBeTruthy();
  });

  it('giá theo MỘT activeService: xe chỉ dài hạn hiện giá /tháng, không /ngày tự lái', () => {
    const longTermOnly = {
      ...LISTING,
      serviceTypes: ['long_term'],
      monthlyPrice: '12000000',
    } as unknown as PublicListing;
    render(<VehicleCard listing={longTermOnly} />);
    expect(screen.getByText('12.000.000 ₫')).toBeTruthy();
    expect(screen.getByText('/tháng')).toBeTruthy();
    // Giá tự lái 1.050.000/ngày KHÔNG được xuất hiện — nó không phải giá dài hạn.
    expect(screen.queryByText('1.050.000 ₫')).toBeNull();
  });

  it('dịch vụ active chưa niêm yết giá → "Liên hệ báo giá", không mượn giá tự lái', () => {
    filters.value = { serviceType: 'with_driver' } as typeof filters.value;
    const withDriver = {
      ...LISTING,
      serviceTypes: ['self_drive', 'with_driver'],
      withDriverDailyPrice: null,
    } as unknown as PublicListing;
    render(<VehicleCard listing={withDriver} />);
    expect(screen.getByText('Liên hệ báo giá')).toBeTruthy();
    expect(screen.queryByText('1.050.000 ₫')).toBeNull();
    expect(detailLink().getAttribute('href')).toBe('/listings/V1?serviceType=with_driver');
  });

  it('lọc có tài xế + xe có giá tài xế → giá đã gồm tài xế và giữ đúng service trong link', () => {
    filters.value = { serviceType: 'with_driver' } as typeof filters.value;
    const withDriver = {
      ...LISTING,
      serviceTypes: ['self_drive', 'with_driver'],
      withDriverDailyPrice: '1300000',
    } as unknown as PublicListing;
    render(<VehicleCard listing={withDriver} />);
    expect(screen.getByText('1.300.000 ₫')).toBeTruthy();
    expect(screen.getByText('đã gồm tài xế')).toBeTruthy();
    expect(detailLink().getAttribute('href')).toBe('/listings/V1?serviceType=with_driver');
  });

  it('không để lại vùng hành động rỗng ở chân thẻ', () => {
    const { container } = render(<VehicleCard listing={LISTING} />);
    // Phần tử cuối trong thân thẻ phải là hàng giá + gian hàng, không phải một khối trống nơi
    // nút thuê từng đứng.
    const body = container.querySelector('article > div:last-child');
    const last = body?.lastElementChild;
    expect(last?.textContent).toContain('Gian hàng Minh Tuấn');
  });
});
