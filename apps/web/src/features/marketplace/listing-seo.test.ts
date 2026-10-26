import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listingJsonLd } from './listing-seo';
import type { PublicListingDetail } from './types';

const LABELS = { home: 'Trang chủ', search: 'Thuê xe' };

function listing(overrides: Partial<PublicListingDetail> = {}): PublicListingDetail {
  return {
    id: 'V1',
    name: 'Mazda CX-5 2022',
    model: 'CX-5',
    color: null,
    description: 'Xe gia đình',
    mainImageUrl: 'https://cdn.example.com/main.jpg',
    images: ['https://cdn.example.com/main.jpg', '/uploads/2.jpg'],
    weekdayPrice: '800000.00',
    withDriverDailyPrice: null,
    monthlyPrice: null,
    ratingAvg: '4.8',
    ratingCount: 12,
    ...overrides,
  } as unknown as PublicListingDetail;
}

type Ld = Record<string, unknown> & { '@type': string };

function byType(items: object[], type: string): Ld | undefined {
  return (items as Ld[]).find((item) => item['@type'] === type);
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_WEB_MARKET_URL', 'https://xeprime.vn');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('listingJsonLd', () => {
  it('dựng Product với giá theo ngày, đánh giá và ảnh tuyệt đối không trùng', () => {
    const product = byType(listingJsonLd(listing(), LABELS), 'Product');
    expect(product).toMatchObject({
      name: 'Mazda CX-5 2022',
      url: 'https://xeprime.vn/listings/V1',
      image: ['https://cdn.example.com/main.jpg', 'https://xeprime.vn/uploads/2.jpg'],
      offers: {
        price: '800000.00',
        priceCurrency: 'VND',
        priceSpecification: { unitCode: 'DAY' },
      },
      aggregateRating: { ratingValue: '4.8', reviewCount: 12, bestRating: 5 },
    });
    // Trường null không được lọt ra JSON-LD.
    expect(JSON.parse(JSON.stringify(product))).not.toHaveProperty('color');
  });

  it('xe chỉ thuê dài hạn công bố giá theo tháng', () => {
    const product = byType(
      listingJsonLd(listing({ weekdayPrice: null, monthlyPrice: '15000000.00' }), LABELS),
      'Product',
    );
    expect(product?.offers).toMatchObject({ price: '15000000.00', priceSpecification: { unitCode: 'MON' } });
  });

  it('chưa có đánh giá thì không khai aggregateRating', () => {
    const product = byType(listingJsonLd(listing({ ratingCount: 0, ratingAvg: null }), LABELS), 'Product');
    expect(product).toBeDefined();
    expect(product?.aggregateRating).toBeUndefined();
  });

  it('không giá và không đánh giá thì bỏ Product (tránh dữ liệu không hợp lệ), giữ breadcrumb', () => {
    const items = listingJsonLd(
      listing({ weekdayPrice: null, ratingCount: 0, ratingAvg: null }),
      LABELS,
    );
    expect(byType(items, 'Product')).toBeUndefined();
    expect(byType(items, 'BreadcrumbList')).toBeDefined();
  });

  it('breadcrumb đi trang chủ → tìm xe → xe', () => {
    const crumbs = byType(listingJsonLd(listing(), LABELS), 'BreadcrumbList');
    expect(crumbs?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: 'https://xeprime.vn/' },
      { '@type': 'ListItem', position: 2, name: 'Thuê xe', item: 'https://xeprime.vn/search' },
      { '@type': 'ListItem', position: 3, name: 'Mazda CX-5 2022', item: 'https://xeprime.vn/listings/V1' },
    ]);
  });
});
