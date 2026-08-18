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
  it('dùng DiscountTag chung và không hiển thị giá cuối tuần/thuê giờ', () => {
    render(<ListingDetailView listing={LISTING} catalog={EMPTY_CATALOG} />);

    expect(screen.getByLabelText('Giảm 15%').textContent).toBe('-15%');
    expect(screen.getByText('408.000 ₫')).toBeTruthy();
    expect(screen.queryByText(/Cuối tuần/)).toBeNull();
    expect(screen.queryByText(/Thuê giờ/)).toBeNull();
    expect(screen.queryByText(/550\.000/)).toBeNull();
    expect(screen.queryByText(/70\.000/)).toBeNull();
  });
});
