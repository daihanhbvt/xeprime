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
