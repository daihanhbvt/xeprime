import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { ApiClientError } from '@xeprime/api-client';
import { API_ERROR_CODE, type PublicListing, type PublicShop } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { marketplaceApi } from './api';
import { ShopDetailScreen } from './ShopDetailScreen';

// Tiền tố `mock` là điều kiện của jest để factory được phép tham chiếu biến ngoài scope.
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

/* Danh mục là một truy vấn RIÊNG (hãng, nhiên liệu, tiện ích) — không phải thứ màn này kiểm. */
jest.mock('@/features/catalog/use-catalog', () => ({
  useCatalog: () => ({ catalog: {} }),
  useCatalogLabels: () => ({
    brandLabel: (key: string) => key,
    bodyTypeLabel: (key: string) => key,
    fuelTypeLabel: (key: string) => key,
    featureLabel: (key: string) => key,
  }),
}));

function shop(overrides: Partial<PublicShop> = {}): PublicShop {
  return {
    name: 'Cho thuê xe Bình Minh',
    slug: 'binh-minh',
    provinceName: 'Đà Nẵng',
    logoUrl: null,
    coverUrl: null,
    bio: 'Gian hàng 12 năm kinh nghiệm.',
    address: '12 Nguyễn Văn Linh, Hải Châu',
    phone: '0901234567',
    ratingAvg: '4.8',
    ratingCount: 26,
    ...overrides,
  };
}

function listing(overrides: Partial<PublicListing> = {}): PublicListing {
  return {
    id: '01JQZX0000000000000000000V',
    name: 'Toyota Vios 2022',
    vehicleType: 'car',
    seatCount: 5,
    transmissionType: 'automatic',
    fuelType: 'gasoline',
    imageUrl: null,
    weekdayPrice: '600000',
    weekendPrice: null,
    hourlyPrice: null,
    monthlyPrice: null,
    withDriverDailyPrice: null,
    serviceTypes: ['self_drive'],
    deliveryEnabled: false,
    noCollateral: false,
    discountPercent: null,
    shopName: 'Cho thuê xe Bình Minh',
    shopSlug: 'binh-minh',
    shopLogoUrl: null,
    shopProvince: 'Đà Nẵng',
    completedTripCount: 12,
    provinceCode: '48',
    ratingAvg: null,
    ratingCount: 0,
    ...overrides,
  } as PublicListing;
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <ShopDetailScreen slug="binh-minh" onBack={jest.fn()} />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
});

function mockShop(value: PublicShop = shop()) {
  return jest.spyOn(marketplaceApi, 'shop').mockResolvedValue(value);
}

function mockListings(items: PublicListing[], total = items.length) {
  return jest.spyOn(marketplaceApi, 'shopListings').mockResolvedValue({
    items,
    meta: { page: 1, limit: 12, total, hasNext: false },
  });
}

describe('ShopDetailScreen — hồ sơ công khai', () => {
  it('hiện đủ hồ sơ gian hàng: tên, tỉnh, đánh giá, giới thiệu, địa chỉ, gọi', async () => {
    mockShop();
    mockListings([listing()]);
    const view = await renderScreen();

    // Tên và tỉnh có mặt ở CẢ đầu trang lẫn chân mỗi thẻ xe — neo vào thứ chỉ đầu trang có.
    expect(await view.findByText('4,8 · 26 đánh giá')).toBeTruthy();
    expect(view.getAllByText('Cho thuê xe Bình Minh').length).toBeGreaterThan(0);
    expect(view.getAllByText('Đà Nẵng').length).toBeGreaterThan(0);
    expect(view.getByText('Gian hàng 12 năm kinh nghiệm.')).toBeTruthy();
    expect(view.getByText('12 Nguyễn Văn Linh, Hải Châu')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Gọi 0901234567' })).toBeTruthy();
  });

  it('gian hàng chưa có đánh giá: nói "chưa có", KHÔNG dựng 0,0 sao', async () => {
    mockShop(shop({ ratingAvg: '0', ratingCount: 0 }));
    mockListings([]);
    const view = await renderScreen();

    expect(await view.findByText('Chưa có đánh giá')).toBeTruthy();
    expect(view.queryByText('0,0 · 0 đánh giá')).toBeNull();
  });

  it('không có số điện thoại: KHÔNG dựng nút gọi rỗng', async () => {
    mockShop(shop({ phone: null }));
    mockListings([]);
    const view = await renderScreen();

    await view.findByText('Cho thuê xe Bình Minh');
    expect(view.queryByRole('button', { name: /^Gọi/ })).toBeNull();
  });

  it('hồ sơ hỏng: cả màn báo lỗi — không còn gì để nói về gian hàng', async () => {
    jest.spyOn(marketplaceApi, 'shop').mockRejectedValue(
      new ApiClientError({
        status: 404,
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy',
      }),
    );
    mockListings([listing()]);
    const view = await renderScreen();

    // Hỏng hồ sơ thì KHÔNG còn danh sách xe nào được vẽ ra — cả màn là màn lỗi, có nút thử lại.
    expect(await view.findByRole('button', { name: 'Thử lại' })).toBeTruthy();
    await waitFor(() => expect(view.queryByText('Toyota Vios 2022')).toBeNull());
  });
});

describe('ShopDetailScreen — xe của gian hàng', () => {
  it('có xe: tiêu đề kèm số đếm và thẻ xe', async () => {
    mockShop();
    mockListings([listing()], 1);
    const view = await renderScreen();

    expect(await view.findByText('Xe đang cho thuê (1)')).toBeTruthy();
    expect(view.getByText('Toyota Vios 2022')).toBeTruthy();
  });

  it('chưa có xe: câu rỗng của web, KHÔNG phải màn trắng', async () => {
    mockShop();
    mockListings([], 0);
    const view = await renderScreen();

    expect(await view.findByText('Gian hàng chưa có xe công khai.')).toBeTruthy();
    expect(view.getByText('Xe đang cho thuê')).toBeTruthy();
  });

  it('danh sách xe hỏng: hồ sơ VẪN đứng nguyên, chỉ khối xe báo lỗi', async () => {
    mockShop();
    jest
      .spyOn(marketplaceApi, 'shopListings')
      .mockRejectedValue(new ApiClientError({ status: 500, code: API_ERROR_CODE.INTERNAL_ERROR, message: 'Lỗi' }));
    const view = await renderScreen();

    expect(await view.findByText('Không tải được danh sách xe')).toBeTruthy();
    // Tên, địa chỉ và số điện thoại là thứ khách vào đây tìm — mất danh sách không được mất chúng.
    expect(view.getByText('Cho thuê xe Bình Minh')).toBeTruthy();
    expect(view.getByText('12 Nguyễn Văn Linh, Hải Châu')).toBeTruthy();
  });
});
