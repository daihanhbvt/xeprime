import { ROUTES, listingPath } from '@/constants/routes';
import { APP_CURRENCY } from '@/i18n/config';
import { absoluteUrl } from '@/lib/seo';
import type { PublicListingDetail } from './types';

/** Mã đơn vị UN/CEFACT mà schema.org dùng cho `unitCode`: một ngày · một tháng. */
const UNIT_CODE = { DAY: 'DAY', MONTH: 'MON' } as const;

/** Thang điểm đánh giá của XePrime (1–5 sao). */
const BEST_RATING = 5;

/** Google chỉ đọc vài ảnh đầu; gửi cả album 40 ảnh chỉ làm HTML nặng thêm. */
const MAX_JSON_LD_IMAGES = 10;

const IN_STOCK = 'https://schema.org/InStock';

/**
 * Giá "từ" để công bố: tự lái theo ngày → có tài xế theo ngày → dài hạn theo tháng. Đây là giá
 * niêm yết để tham khảo, đúng như trang xe đang hiện; giá thật của một chuyến do backend tính
 * lúc gửi yêu cầu (`PricingService`).
 */
function headlinePrice(listing: PublicListingDetail): { price: string; unitCode: string } | null {
  const candidates = [
    [listing.weekdayPrice, UNIT_CODE.DAY],
    [listing.withDriverDailyPrice, UNIT_CODE.DAY],
    [listing.monthlyPrice, UNIT_CODE.MONTH],
  ] as const;
  for (const [price, unitCode] of candidates) {
    if (price && Number(price) > 0) return { price, unitCode };
  }
  return null;
}

/**
 * JSON-LD của trang xe: `Product` (ảnh, giá, đánh giá) + `BreadcrumbList`.
 *
 * `Product` chỉ có mặt khi có ít nhất `offers` hoặc `aggregateRating` — thiếu cả hai là dữ liệu
 * có cấu trúc không hợp lệ theo Google và bị báo lỗi trong Search Console. Không có đánh giá thì
 * không khai `aggregateRating` (0 sao là một lời nói dối, không phải "chưa có").
 */
export function listingJsonLd(
  listing: PublicListingDetail,
  labels: { home: string; search: string },
): object[] {
  const url = absoluteUrl(listingPath.detail(listing.id));
  const images = [
    ...new Set([listing.mainImageUrl, ...listing.images].filter((src): src is string => !!src)),
  ]
    .slice(0, MAX_JSON_LD_IMAGES)
    .map(absoluteUrl);

  const price = headlinePrice(listing);
  const offers = price
    ? {
        '@type': 'Offer',
        url,
        price: price.price,
        priceCurrency: APP_CURRENCY,
        availability: IN_STOCK,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: price.price,
          priceCurrency: APP_CURRENCY,
          unitCode: price.unitCode,
        },
      }
    : undefined;

  const aggregateRating =
    listing.ratingCount > 0 && listing.ratingAvg && Number(listing.ratingAvg) > 0
      ? {
          '@type': 'AggregateRating',
          ratingValue: listing.ratingAvg,
          reviewCount: listing.ratingCount,
          bestRating: BEST_RATING,
        }
      : undefined;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: labels.home, item: absoluteUrl(ROUTES.HOME) },
      { '@type': 'ListItem', position: 2, name: labels.search, item: absoluteUrl(ROUTES.SEARCH) },
      { '@type': 'ListItem', position: 3, name: listing.name, item: url },
    ],
  };

  if (!offers && !aggregateRating) return [breadcrumb];

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: listing.name,
      url,
      image: images.length > 0 ? images : undefined,
      description: listing.description ?? undefined,
      model: listing.model ?? undefined,
      color: listing.color ?? undefined,
      offers,
      aggregateRating,
    },
    breadcrumb,
  ];
}
