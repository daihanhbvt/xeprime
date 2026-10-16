import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicBanner } from '@/features/banners/types';
import type { FeaturedReview, PublicDestination, PublicShopSummary } from '../types';
import { CustomerReviews } from './CustomerReviews';
import { FeaturedHosts } from './FeaturedHosts';
import { FeaturedLocations } from './FeaturedLocations';
import { PromoBanners } from './PromoBanners';

/**
 * Ba khối dữ liệu THẬT của trang chủ v2 (ADR 0062) — thứ mắt không bắt được khi xem trang với
 * dữ liệu seed: trạng thái rỗng/lỗi, và phép tra số liệu theo MÃ tỉnh của thẻ địa điểm.
 */
const data = vi.hoisted(() => ({
  destinations: [] as PublicDestination[],
  shops: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown },
  reviews: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown },
}));

vi.mock('../hooks/use-destinations', () => ({
  useAllDestinations: () => ({ data: data.destinations, isLoading: false, error: null }),
}));
vi.mock('../hooks/use-featured-shops', () => ({ useFeaturedShops: () => data.shops }));
vi.mock('../hooks/use-featured-reviews', () => ({ useFeaturedReviews: () => data.reviews }));

beforeEach(() => {
  data.destinations = [];
  data.shops = { data: undefined, isLoading: false, isError: false, error: null };
  data.reviews = { data: undefined, isLoading: false, isError: false, error: null };
});

afterEach(cleanup);

function shop(overrides: Partial<PublicShopSummary> = {}): PublicShopSummary {
  return {
    name: 'XePrime Sài Gòn',
    slug: 'xeprime-sai-gon',
    logoUrl: null,
    provinceName: 'Hồ Chí Minh',
    vehicleCount: 10,
    ratingAvg: '4.80',
    ratingCount: 4,
    verified: true,
    bio: 'Đội xe đời mới, giao tận nơi.',
    completedTripCount: 14,
    featuredVehicleImageUrl: null,
    ...overrides,
  };
}

function review(overrides: Partial<FeaturedReview> = {}): FeaturedReview {
  return {
    id: 'R1',
    rating: 5,
    comment: 'Xe sạch, giao đúng giờ, chủ xe nhiệt tình.',
    customerName: 'Lê Hoàng C.',
    customerTripCount: 0,
    vehicleId: 'V1',
    vehicleName: 'Toyota Vios',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('FeaturedLocations — số liệu tra theo MÃ tỉnh', () => {
  it('thành phố có xe mang số xe + giá "chỉ từ"; thành phố chưa có xe vẫn hiện thẻ, không bịa số', () => {
    data.destinations = [
      {
        provinceCode: '01',
        provinceName: 'Hà Nội',
        vehicleCount: 10,
        imageUrl: null,
        minDailyPrice: '550000',
      },
    ];
    render(<FeaturedLocations />);

    const hanoi = screen.getByRole('link', { name: /Hà Nội/ });
    expect(hanoi.getAttribute('href')).toBe('/search?provinceCode=01');
    expect(within(hanoi).getByText(/10 xe/)).toBeTruthy();
    expect(within(hanoi).getByText('550k')).toBeTruthy();

    // Huế (46) không có trong dữ liệu: thẻ vẫn dẫn tới đúng tỉnh nhưng không có dòng số liệu.
    const hue = screen.getByRole('link', { name: /Huế/ });
    expect(hue.getAttribute('href')).toBe('/search?provinceCode=46');
    expect(within(hue).queryByText(/xe có sẵn/)).toBeNull();
  });
});

describe('FeaturedHosts', () => {
  it('chưa có gian hàng nào đủ điều kiện thì ẩn cả khối', () => {
    data.shops = { data: { shops: [] }, isLoading: false, isError: false, error: null };
    const { container } = render(<FeaturedHosts />);
    expect(container.innerHTML).toBe('');
  });

  it('lỗi tải thì báo lỗi, không im lặng', () => {
    data.shops = { data: undefined, isLoading: false, isError: true, error: new Error('x') };
    render(<FeaturedHosts />);
    expect(screen.getByText('Không tải được danh sách gian hàng')).toBeTruthy();
  });

  it('thẻ dẫn tới trang gian hàng; số chuyến 0 thì không hiện "Đã thuê"', () => {
    data.shops = {
      data: { shops: [shop(), shop({ slug: 'moi', name: 'Chủ xe mới', completedTripCount: 0 })] },
      isLoading: false,
      isError: false,
      error: null,
    };
    render(<FeaturedHosts />);
    const card = screen.getByRole('link', { name: 'Xem gian hàng XePrime Sài Gòn' });
    expect(card.getAttribute('href')).toBe('/shops/xeprime-sai-gon');
    expect(within(card).getByText('14')).toBeTruthy();

    const fresh = screen.getByRole('link', { name: 'Xem gian hàng Chủ xe mới' });
    expect(within(fresh).queryByText(/Đã thuê/)).toBeNull();
  });
});

describe('CustomerReviews', () => {
  it('chưa có đánh giá nào đủ điều kiện thì ẩn cả cột', () => {
    data.reviews = { data: [], isLoading: false, isError: false, error: null };
    const { container } = render(<CustomerReviews />);
    expect(container.innerHTML).toBe('');
  });

  it('hiện lời nhận xét + điểm; "Đã thuê N lần" chỉ khi N > 0', () => {
    data.reviews = {
      data: [review(), review({ id: 'R2', customerName: 'Trần Thị B.', customerTripCount: 7 })],
      isLoading: false,
      isError: false,
      error: null,
    };
    render(<CustomerReviews />);
    expect(screen.getAllByRole('img', { name: '5,0 trên 5 sao' })).toHaveLength(2);
    expect(screen.getByText('Đã thuê 7 lần')).toBeTruthy();
    expect(screen.queryByText('Đã thuê 0 lần')).toBeNull();
  });
});

describe('PromoBanners — banner khuyến mãi do admin quản lý', () => {
  function promo(overrides: Partial<PublicBanner> = {}): PublicBanner {
    return {
      id: 'P1',
      imageUrl: 'https://cdn.example.com/promo.jpg',
      tabletImageUrl: null,
      mobileImageUrl: null,
      altText: 'Tuần lễ siêu sale',
      linkUrl: '/search',
      ...overrides,
    };
  }

  it('không có banner nào thì không dựng khối', () => {
    const { container } = render(<PromoBanners banners={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('đích nội bộ mở trong app, đích ngoài mở tab mới; không có đích thì không bấm được', () => {
    const { container } = render(
      <PromoBanners
        banners={[
          promo(),
          promo({ id: 'P2', altText: 'Đối tác', linkUrl: 'https://partner.example.com' }),
          promo({ id: 'P3', altText: 'Chỉ ảnh', linkUrl: null }),
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Tuần lễ siêu sale' }).getAttribute('href')).toBe(
      '/search',
    );
    const external = screen.getByRole('link', { name: 'Đối tác' });
    expect(external.getAttribute('target')).toBe('_blank');
    expect(external.getAttribute('rel')).toContain('noopener');
    expect(screen.getByAltText('Chỉ ảnh').closest('a')).toBeNull();
    // Không có ảnh mobile ⇒ không có nguồn mobile — mobile hiện ảnh máy tính nguyên khung.
    expect(container.querySelectorAll('source')).toHaveLength(0);
  });

  it('có ảnh mobile thì thêm nguồn cho màn ≤ 640px', () => {
    const { container } = render(
      <PromoBanners banners={[promo({ mobileImageUrl: 'https://cdn.example.com/m.jpg' })]} />,
    );
    const source = container.querySelector('source');
    expect(source?.getAttribute('media')).toBe('(max-width: 640px)');
    expect(source?.getAttribute('srcset')).toBe('https://cdn.example.com/m.jpg');
  });
});
