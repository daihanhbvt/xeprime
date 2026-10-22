import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VehicleCard } from './VehicleCard';
import type { PublicListing } from '../types';
import { renderWithIntl as render } from '@/i18n/test-utils';

/** Trái tim cần phiên + QueryClient + hộp đăng nhập — có test riêng ở `features/favorites`. */
vi.mock('@/features/favorites/components/FavoriteButton', () => ({
  FavoriteButton: ({ vehicleId }: { vehicleId: string }) => (
    <button type="button" data-testid={`favorite-${vehicleId}`} />
  ),
}));

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
  vatInvoiceSupported: false,
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

  /**
   * Không có hành động thuê nào trong thẻ: nút DUY NHẤT là trái tim Xe yêu thích (mở 21/10/2026,
   * nối API thật) — mọi chỗ còn lại của thẻ là một liên kết tới trang chi tiết.
   */
  it('nút duy nhất trong thẻ là trái tim yêu thích — còn lại là một liên kết', () => {
    render(<VehicleCard listing={LISTING} />);
    const buttons = screen.queryAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute('data-testid')).toBe('favorite-V1');
  });

  /** ADR 0011: % giảm là của giá TỰ LÁI — ngữ cảnh dài hạn/có tài xế không mang huy hiệu đó. */
  it('huy hiệu giảm giá chỉ hiện ở ngữ cảnh tự lái', () => {
    const discounted = {
      ...LISTING,
      discountPercent: 10,
      serviceTypes: ['self_drive', 'long_term'],
      monthlyPrice: '12000000',
    } as unknown as PublicListing;
    const { rerender } = render(<VehicleCard listing={discounted} />);
    expect(screen.getByLabelText('Giảm 10%')).toBeTruthy();

    filters.value = { serviceType: 'long_term' } as typeof filters.value;
    rerender(<VehicleCard listing={discounted} />);
    expect(screen.queryByLabelText('Giảm 10%')).toBeNull();
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

  /** Thẻ v2 (ADR 0062) bỏ số chuyến đã chạy — chân thẻ là điểm sao (số lượt) + giá. */
  it('hiển thị điểm xe kèm số lượt đánh giá và nhận diện gian hàng', () => {
    const { container } = render(<VehicleCard listing={LISTING} />);
    expect(screen.getByText('(12)')).toBeTruthy();
    expect(container.textContent).toContain('4,8');
    expect(screen.queryByText('27 chuyến')).toBeNull();
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
    expect(screen.getByText('12tr')).toBeTruthy();
    expect(screen.getByText('/tháng')).toBeTruthy();
    // Giá tự lái 1.050.000/ngày KHÔNG được xuất hiện — nó không phải giá dài hạn.
    expect(screen.queryByText('1,05tr')).toBeNull();
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
    expect(screen.queryByText('1,05tr')).toBeNull();
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
    expect(screen.getByText('1,3tr')).toBeTruthy();
    expect(screen.getByText('đã gồm tài xế')).toBeTruthy();
    expect(detailLink().getAttribute('href')).toBe('/listings/V1?serviceType=with_driver');
  });

  /*
   * Tiền trên thẻ ở dạng RÚT GỌN để chân thẻ còn chỗ cho tên gian hàng. Hai assert dưới khoá
   * đúng chỗ dễ hỏng của việc rút gọn: bậc nghìn phải CHÍNH XÁC (600.000 là `600k`, không phải
   * `0,6tr`), và bậc triệu phải giữ hai chữ số lẻ — `1,05tr`, không phải `1tr`.
   */
  it('giá trên thẻ ở dạng rút gọn, bậc nghìn chính xác tuyệt đối', () => {
    render(<VehicleCard listing={{ ...LISTING, weekdayPrice: '600000' } as PublicListing} />);
    expect(screen.getByText('600k')).toBeTruthy();
    expect(screen.getByText('/ngày')).toBeTruthy();
    expect(screen.queryByText('600.000 ₫')).toBeNull();
  });

  it('bậc triệu giữ 2 chữ số lẻ — không làm tròn mất 50.000đ của khách', () => {
    render(<VehicleCard listing={LISTING} />);
    // 1.050.000 ₫ — ở 1 chữ số lẻ nó sẽ in ra "1tr" và thẻ nói sai giá.
    expect(screen.getByText('1,05tr')).toBeTruthy();
  });

  it('giá gạch bỏ cũng rút gọn — hai số cạnh nhau phải cùng một dạng', () => {
    const discounted = { ...LISTING, discountPercent: 20 } as PublicListing;
    const { container } = render(<VehicleCard listing={discounted} />);
    const struck = container.querySelector('s');
    // 1.050.000 gạch bỏ, còn 840.000 sau giảm 20%.
    expect(struck?.textContent).toBe('1,05tr');
    expect(screen.getByText('840k')).toBeTruthy();
  });

  /*
   * HAI TUYẾN trên một chợ (ADR 0028). Thẻ của gian hàng tuyến gói và thẻ của chủ xe cá nhân
   * phải đọc ra khác nhau ngay ở lưới kết quả, và `shopVerified` của backend là nguồn DUY NHẤT
   * quyết định điều đó — thẻ không được tự suy từ tên gian hàng hay từ việc có logo hay không.
   */
  it('tuyến hoa hồng: nhãn "Chủ xe", không dấu xác thực', () => {
    render(<VehicleCard listing={{ ...LISTING, shopVerified: false } as PublicListing} />);
    expect(screen.getByText('Chủ xe')).toBeTruthy();
    expect(screen.queryByText('Gian hàng')).toBeNull();
    expect(screen.queryByRole('img', { name: /xác minh/i })).toBeNull();
  });

  it('tuyến gói: nhãn "Gian hàng" + dấu xác thực XePrime', () => {
    render(<VehicleCard listing={{ ...LISTING, shopVerified: true } as PublicListing} />);
    expect(screen.getByText('Gian hàng')).toBeTruthy();
    expect(screen.queryByText('Chủ xe')).toBeNull();
    // Dấu xác thực là hình trang trí trong avatar; `aria-label` của liên kết nuốt mọi chữ bên
    // trong — nên chính nó phải mang nghĩa của dấu.
    expect(
      screen.getByRole('link', {
        name: 'Gian hàng Minh Tuấn — gian hàng đã được XePrime xác minh',
      }),
    ).toBeTruthy();
  });

  it('backend chưa trả shopVerified → thẻ THƯỜNG, không gắn dấu cho mọi người', () => {
    // Trong một lần deploy lệch, mặc định phải là "chưa xác minh": gắn dấu cho tất cả là nói
    // sai về mọi chủ xe cá nhân trên chợ.
    const legacy = { ...LISTING } as Record<string, unknown>;
    delete legacy.shopVerified;
    render(<VehicleCard listing={legacy as PublicListing} />);
    expect(screen.getByText('Chủ xe')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /xác minh/i })).toBeNull();
  });

  it('tên gian hàng dài vẫn cắt được, dấu xác thực nằm ngoài phần bị cắt', () => {
    const { container } = render(
      <VehicleCard
        listing={
          {
            ...LISTING,
            shopVerified: true,
            shopName: 'XePrime Sài Gòn Cho Thuê Xe Tự Lái Giá Rẻ',
          } as PublicListing
        }
      />,
    );
    const mark = container.querySelector('img[src*="card-verified"]');
    const clipped = screen.getByText('XePrime Sài Gòn Cho Thuê Xe Tự Lái Giá Rẻ');
    expect(mark).toBeTruthy();
    expect(clipped.contains(mark)).toBe(false);
  });

  it('hoá đơn VAT (ADR 0059): chỉ gắn nhãn khi chủ xe đã bật — false không có nhãn phủ định', () => {
    const { rerender } = render(<VehicleCard listing={LISTING} />);
    expect(screen.queryByText(/hoá đơn VAT/i)).toBeNull();

    rerender(<VehicleCard listing={{ ...LISTING, vatInvoiceSupported: true }} />);
    expect(screen.getByText('Xuất hoá đơn VAT')).toBeTruthy();
  });

  it('không để lại vùng hành động rỗng ở chân thẻ', () => {
    const { container } = render(<VehicleCard listing={LISTING} />);
    // Phần tử cuối trong thân thẻ phải là hàng điểm + giá, không phải một khối trống nơi nút
    // thuê từng đứng.
    const body = container.querySelector('article > div:last-child');
    const last = body?.lastElementChild;
    expect(last?.textContent).toContain('1,05tr');
  });
});

describe('VehicleCard — trái tim yêu thích', () => {
  it('cả hai dạng thẻ gắn trái tim của ĐÚNG xe (không còn state cục bộ)', () => {
    const { unmount } = render(<VehicleCard listing={LISTING} />);
    expect(screen.getByTestId('favorite-V1')).toBeTruthy();
    unmount();
    render(<VehicleCard listing={LISTING} variant="list" />);
    expect(screen.getByTestId('favorite-V1')).toBeTruthy();
  });
});
