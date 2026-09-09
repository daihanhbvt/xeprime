import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_CATALOG } from '@/features/catalog/types';
import type { PublicListingDetail } from '../types';
import { ListingDetailView } from './ListingDetailView';

vi.mock('@/features/booking-requests/components/RequestBookingButton', () => ({
  RequestBookingButton: () => <button type="button">Chọn thuê</button>,
}));

vi.mock('@/features/chat/components/ChatWithShopButton', () => ({
  ChatWithShopButton: () => <button type="button">Nhắn shop</button>,
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
    render(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

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
        autoAcceptMinLeadMinutes: 360,
        autoAcceptMaxLeadMinutes: 10080,
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
        autoAcceptMinLeadMinutes: 360,
        autoAcceptMaxLeadMinutes: 10080,
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
    render(await ListingDetailView({ listing: WITH_TERMS, catalog: EMPTY_CATALOG }));

    expect(screen.getByText('Thủ tục & điều kiện thuê')).toBeTruthy();
    expect(screen.getByText(/Giấy tờ cần có: Giấy phép lái xe/)).toBeTruthy();
    expect(screen.getByText('Đặt ngay')).toBeTruthy();
    expect(screen.getByText('Không hút thuốc trong xe.')).toBeTruthy();
    // "Đối chiếu VNeID" là người xem app của khách — không hứa gọi API định danh.
    expect(screen.queryByText(/tự động (tra cứu|xác thực|định danh)/i)).toBeNull();
  });

  it('hiện khung giờ giao nhận nhưng KHÔNG lộ thời gian chết nội bộ của gian hàng', async () => {
    render(await ListingDetailView({ listing: WITH_TERMS, catalog: EMPTY_CATALOG }));

    expect(screen.getByText('Khung giờ giao nhận')).toBeTruthy();
    expect(screen.getByText(/08:00–18:00/)).toBeTruthy();
    expect(screen.queryByText(/chuẩn bị giữa hai chuyến/i)).toBeNull();
  });

  it('phụ phí tài xế chỉ hiện khi khách đang xem dịch vụ CÓ TÀI XẾ', async () => {
    const { unmount } = render(
      await ListingDetailView({ listing: WITH_TERMS, catalog: EMPTY_CATALOG }),
    );
    expect(screen.queryByText('Phụ phí có thể phát sinh')).toBeNull();
    unmount();

    render(
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
    render(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

    expect(screen.getByText('VinFast Fadil 2022')).toBeTruthy();
    expect(screen.queryByText('Thủ tục & điều kiện thuê')).toBeNull();
    expect(screen.queryByText('Khung giờ giao nhận')).toBeNull();
  });
});
