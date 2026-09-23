import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_CATALOG } from '@/features/catalog/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { PublicListingDetail } from '../types';
import { ListingDetailView } from './ListingDetailView';

vi.mock('@/features/booking-requests/components/RequestBookingButton', () => ({
  RequestBookingButton: () => <button type="button">Chọn thuê</button>,
}));

/*
 * `ShopChatButton` tự hỏi server "khách này nhắn được chưa" qua TanStack Query, nên render thật
 * nó ở đây sẽ đòi một QueryClientProvider mà bài test này không có lý do gì phải dựng — nó đang
 * đo GIÁ và ĐIỀU KIỆN THUÊ. Luật ẩn/hiện nút có spec riêng ở `ShopContactActions.test.tsx`.
 */
vi.mock('@/features/chat/components/ShopChatButton', () => ({
  ShopChatButton: () => <button type="button">Nhắn shop</button>,
}));

/*
 * `getAppFormat()` gọi `getLocale()` của next-intl — API chỉ chạy trong môi trường react-server,
 * nên trong jsdom nó ném. Thay bằng bộ định dạng dựng từ CHÍNH bó message thật.
 */
vi.mock('next-intl/server', async () => {
  const { serverTranslationsStub } = await import('@/i18n/test-utils');
  return serverTranslationsStub('vi');
});

vi.mock('@/i18n/server-format', async () => {
  const { createTestAppFormat } = await import('@/i18n/test-utils');
  return { getAppFormat: async () => createTestAppFormat('vi') };
});

vi.mock('./ListingGallery', () => ({
  ListingGallery: () => <div aria-label="Ảnh xe" />,
}));

vi.mock('./ListingReviews', () => ({
  ListingReviews: () => <div>Đánh giá</div>,
}));

vi.mock('./ListingServiceSelector', () => ({
  ListingServiceSelector: () => <div>Dịch vụ</div>,
}));

const LISTING = {
  id: 'listing-1',
  name: 'VinFast Fadil 2022',
  vehicleType: 'car',
  serviceTypes: ['self_drive'],
  brand: 'vinfast',
  model: 'Fadil',
  seatCount: 5,
  fuelType: 'gasoline',
  bodyType: 'mini_car',
  mainImageUrl: null,
  weekdayPrice: '480000',
  weekendPrice: '550000',
  hourlyPrice: '70000',
  monthlyPrice: null,
  withDriverDailyPrice: null,
  deliveryEnabled: false,
  noCollateral: true,
  discountPercent: 15,
  shopName: 'Gian hàng Demo XePrime',
  shopSlug: 'demo-xeprime',
  /*
   * Ba chỉ số uy tín của chủ xe (ADR 0045 điều 3) — ở đây là gian hàng CHƯA đủ mẫu, nên khối
   * chỉ hiện đúng một câu "chưa đủ dữ liệu" và không con số nào lọt vào những phép so giá bên
   * dưới.
   */
  shopMetrics: {
    sampleCount: 0,
    responseRatePercent: null,
    acceptKeepRatePercent: null,
    responseMinutesMedian: null,
    instantBook: false,
  },
  shopProvince: 'Hồ Chí Minh',
  ratingAvg: '0',
  ratingCount: 0,
  description: null,
  color: 'Trắng',
  manufactureYear: 2022,
  shopLogoUrl: null,
  shopBio: null,
  images: [],
  features: [],
  longTermPackages: [],
} as unknown as PublicListingDetail;

afterEach(cleanup);

describe('ListingDetailView pricing', () => {
  /*
   * `ListingDetailView` là SERVER Component async (nó `await getAppFormat()`), nên không render
   * thẳng bằng JSX được: gọi nó như một hàm, chờ cây trả về, rồi mới render cây đó.
   * Chính bài test này là thứ bắt được nếu ai đó lỡ biến nó thành Client Component.
   */
  it('dùng DiscountTag chung và không hiển thị giá cuối tuần/thuê giờ', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

    expect(screen.getByLabelText('Giảm 15%').textContent).toBe('-15%');
    expect(screen.getByText('408.000 ₫')).toBeTruthy();
    expect(screen.queryByText(/Cuối tuần/)).toBeNull();
    expect(screen.queryByText(/Thuê giờ/)).toBeNull();
    expect(screen.queryByText(/550\.000/)).toBeNull();
    expect(screen.queryByText(/70\.000/)).toBeNull();
  });
});

/**
 * Thủ tục / khung giờ / phụ phí do CHỦ XE cấu hình (08/09/2026) được công bố ở trang xe.
 *
 * Khách phải biết trước khi gửi yêu cầu, chứ không phải tới quầy mới biết mình thiếu giấy tờ hay
 * chủ xe không giao sau 18h. Ba điều quan trọng ở đây: quy tắc phụ phí chỉ thuộc chuyến CÓ TÀI
 * XẾ, "đối chiếu VNeID" là thao tác THỦ CÔNG (không hứa tra cứu tự động), và trang không được
 * vỡ khi API cũ chưa trả ba khối này.
 */
describe('ListingDetailView — điều kiện thuê công bố', () => {
  const WITH_TERMS = {
    ...LISTING,
    serviceTypes: ['self_drive', 'with_driver'],
    withDriverDailyPrice: '1300000',
    rentalTerms: [
      {
        serviceType: 'self_drive',
        requiredDocuments: ['driver_licence', 'citizen_id'],
        identityVerifyMethod: 'vneid',
        termsText: 'Không hút thuốc trong xe.',
        requireTermsAcceptance: true,
        depositMode: null,
        instantBookEnabled: true,
        minRentalMinutes: null,
      },
      {
        serviceType: 'with_driver',
        requiredDocuments: ['citizen_id'],
        identityVerifyMethod: 'in_person',
        termsText: null,
        requireTermsAcceptance: false,
        depositMode: 'none',
        instantBookEnabled: false,
        minRentalMinutes: 720,
      },
    ],
    handover: {
      pickupWindows: [{ start: '08:00', end: '18:00' }],
      returnWindows: [{ start: '08:00', end: '20:00' }],
    },
    driverSurchargeRules: [
      { kind: 'waiting', unit: 'per_30_minutes', amount: '30000', thresholdValue: 30 },
    ],
  } as unknown as PublicListingDetail;

  it('tự lái: hiện giấy tờ, cách đối chiếu, điều khoản và nhãn Đặt ngay', async () => {
    renderWithIntl(await ListingDetailView({ listing: WITH_TERMS, catalog: EMPTY_CATALOG }));

    expect(screen.getByText('Thủ tục & điều kiện thuê')).toBeTruthy();
    expect(screen.getByText(/Giấy tờ cần có: Giấy phép lái xe/)).toBeTruthy();
    expect(screen.getByText('Đặt ngay')).toBeTruthy();
    expect(screen.getByText('Không hút thuốc trong xe.')).toBeTruthy();
    // "Đối chiếu VNeID" là người xem app của khách — không hứa gọi API định danh.
    expect(screen.queryByText(/tự động (tra cứu|xác thực|định danh)/i)).toBeNull();
  });

  it('hiện khung giờ giao nhận nhưng KHÔNG lộ thời gian chết nội bộ của gian hàng', async () => {
    renderWithIntl(await ListingDetailView({ listing: WITH_TERMS, catalog: EMPTY_CATALOG }));

    expect(screen.getByText('Khung giờ giao nhận')).toBeTruthy();
    expect(screen.getByText(/08:00–18:00/)).toBeTruthy();
    expect(screen.queryByText(/chuẩn bị giữa hai chuyến/i)).toBeNull();
  });

  it('phụ phí tài xế chỉ hiện khi khách đang xem dịch vụ CÓ TÀI XẾ', async () => {
    const { unmount } = renderWithIntl(
      await ListingDetailView({ listing: WITH_TERMS, catalog: EMPTY_CATALOG }),
    );
    expect(screen.queryByText('Phụ phí có thể phát sinh')).toBeNull();
    unmount();

    renderWithIntl(
      await ListingDetailView({
        listing: WITH_TERMS,
        catalog: EMPTY_CATALOG,
        serviceType: 'with_driver',
      }),
    );
    expect(screen.getByText('Phụ phí có thể phát sinh')).toBeTruthy();
    expect(screen.getByText(/Phụ phí chờ đợi/)).toBeTruthy();
    expect(screen.getByText(/Không cần cọc giữ chuyến/)).toBeTruthy();
  });

  it('API cũ chưa trả ba khối này: trang vẫn dựng, chỉ thiếu mục thông tin', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

    expect(screen.getByText('VinFast Fadil 2022')).toBeTruthy();
    expect(screen.queryByText('Thủ tục & điều kiện thuê')).toBeNull();
    expect(screen.queryByText('Khung giờ giao nhận')).toBeNull();
  });

  /*
   * Body CŨ trong Data Cache của Next: `fetchListingDetail` cache 30 giây theo kiểu
   * stale-while-revalidate, nên ngay sau khi backend thêm một trường, lượt đọc stale đầu tiên
   * vẫn nhận body của phiên bản trước — thiếu hẳn `shopMetrics` dù kiểu sinh từ OpenAPI khai
   * nó bắt buộc. Trước 22/09/2026 chỗ đó ném `Cannot read properties of undefined` và giết cả
   * trang chi tiết xe, ngẫu nhiên theo đúng nhịp hết hạn cache.
   */
  it('body cũ thiếu hẳn shopMetrics: trang vẫn dựng, khối uy tín im lặng', async () => {
    const { shopMetrics: _omitted, ...withoutMetrics } = LISTING;
    renderWithIntl(
      await ListingDetailView({
        listing: withoutMetrics as unknown as PublicListingDetail,
        catalog: EMPTY_CATALOG,
      }),
    );

    expect(screen.getByText('VinFast Fadil 2022')).toBeTruthy();
    expect(screen.getByText('Gian hàng Demo XePrime')).toBeTruthy();
    // Không có số liệu thì không nói gì — kể cả câu "chưa đủ dữ liệu", vốn là một khẳng định.
    expect(screen.queryByText(/Chưa đủ dữ liệu/)).toBeNull();
  });
});

/**
 * HẠN MỨC QUÃNG ĐƯỜNG (21/09/2026) — khách phải đọc được TRƯỚC khi gửi yêu cầu.
 *
 * Phí vượt km không nằm trong báo giá (lúc đặt chưa ai biết khách sẽ chạy bao xa), nên thứ duy
 * nhất làm nó công bằng là được công bố ở đây. Hai điều bị khoá: nó chỉ thuộc chuyến TỰ LÁI, và
 * xe không đặt hạn mức thì khối biến mất hoàn toàn — không có dòng "không giới hạn" nào.
 */
describe('ListingDetailView — hạn mức quãng đường', () => {
  const WITH_MILEAGE = {
    ...LISTING,
    serviceTypes: ['self_drive', 'with_driver'],
    withDriverDailyPrice: '1300000',
    mileagePolicy: { includedKmPerDay: 200, excessFeePerKm: '3000' },
  } as unknown as PublicListingDetail;

  it('tự lái: hiện số km mỗi ngày và tiền mỗi km vượt', async () => {
    renderWithIntl(await ListingDetailView({ listing: WITH_MILEAGE, catalog: EMPTY_CATALOG }));

    expect(screen.getByText('Hạn mức quãng đường')).toBeTruthy();
    expect(screen.getByText(/Bao gồm 200 km\/ngày/)).toBeTruthy();
    expect(screen.getByText(/3\.000/)).toBeTruthy();
    // Và nói rõ hạn mức phụ thuộc số ngày thuê có tính phí.
    expect(screen.getByText(/số ngày thuê có tính phí/)).toBeTruthy();
  });

  it('có tài xế: KHÔNG hiện — đi xa là phụ phí đường dài, một khoản khác', async () => {
    renderWithIntl(
      await ListingDetailView({
        listing: WITH_MILEAGE,
        catalog: EMPTY_CATALOG,
        serviceType: 'with_driver',
      }),
    );

    expect(screen.queryByText('Hạn mức quãng đường')).toBeNull();
  });

  it('xe không đặt hạn mức: không có khối rỗng, không có số 0 nào', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

    expect(screen.queryByText('Hạn mức quãng đường')).toBeNull();
    expect(screen.queryByText(/Bao gồm 0 km/)).toBeNull();
  });
});
