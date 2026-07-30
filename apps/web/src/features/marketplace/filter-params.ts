import { LISTING_SORT_VALUES } from '@xeprime/types';
import type { QueryParams } from '@/services/api-client';
import type { ListingSort, MarketplaceFilters } from './types';

/**
 * Đọc/ghi filter marketplace ↔ URL searchParams (ADR 0004) — thuần hàm, không đụng
 * next/navigation để unit-test được. Quy ước wire: mảng = CSV (`sedan,suv`), boolean = `1`.
 */

const ARRAY_KEYS = ['brand', 'bodyType', 'seats', 'fuelType', 'features'] as const;
const BOOLEAN_KEYS = ['hourly', 'delivery', 'noCollateral', 'discount'] as const;
const NUMBER_KEYS = ['minSeats', 'priceMin', 'priceMax', 'page', 'limit'] as const;
const STRING_KEYS = ['vehicleType', 'serviceType', 'q', 'province', 'pickupAt', 'returnAt'] as const;

/**
 * Các key thuộc panel Bộ lọc — "Xoá bộ lọc" reset đúng nhóm này, giữ nguyên ngữ cảnh tìm kiếm
 * (q / địa điểm / ngày giờ / loại xe / dịch vụ).
 */
export const FACET_FILTER_KEYS = [
  ...ARRAY_KEYS,
  ...BOOLEAN_KEYS,
  'priceMin',
  'priceMax',
  'sort',
] as const;

export type FacetFilterKey = (typeof FACET_FILTER_KEYS)[number];

export function parseFilters(searchParams: URLSearchParams): MarketplaceFilters {
  const filters: MarketplaceFilters = {};

  for (const key of STRING_KEYS) {
    const raw = searchParams.get(key);
    if (raw) filters[key] = raw;
  }
  for (const key of NUMBER_KEYS) {
    const raw = searchParams.get(key);
    if (!raw) continue;
    const n = Number(raw);
    if (Number.isFinite(n)) filters[key] = n;
  }
  for (const key of ARRAY_KEYS) {
    const raw = searchParams.get(key);
    if (!raw) continue;
    const values = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (values.length > 0) filters[key] = values;
  }
  for (const key of BOOLEAN_KEYS) {
    if (searchParams.get(key) === '1') filters[key] = true;
  }

  const sort = searchParams.get('sort');
  if (sort && (LISTING_SORT_VALUES as readonly string[]).includes(sort)) {
    filters.sort = sort as ListingSort;
  }

  return filters;
}

/**
 * Ghi một patch filter vào searchParams (mutate tại chỗ). `undefined`/`null`/`''`/mảng rỗng/
 * boolean false = xoá param. Đổi filter thì về trang 1, trừ khi chính `page` đang được đổi.
 */
export function applyFilterPatch(
  params: URLSearchParams,
  patch: Partial<MarketplaceFilters>,
): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === '') {
      params.delete(key);
    } else if (Array.isArray(value)) {
      if (value.length === 0) params.delete(key);
      else params.set(key, value.join(','));
    } else if (typeof value === 'boolean') {
      if (value) params.set(key, '1');
      else params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }
  if (!('page' in patch)) params.delete('page');
}

/**
 * Filter → query param gửi API (`/public/listings` và `/public/listings/facets`) — cùng quy ước
 * CSV/boolean với URL, một chỗ duy nhất để hai hook không lệch nhau.
 */
export function toListingQueryParams(filters: MarketplaceFilters): QueryParams {
  return {
    vehicleType: filters.vehicleType ?? null,
    serviceType: filters.serviceType ?? null,
    q: filters.q ?? null,
    province: filters.province ?? null,
    brand: filters.brand?.length ? filters.brand.join(',') : null,
    bodyType: filters.bodyType?.length ? filters.bodyType.join(',') : null,
    seats: filters.seats?.length ? filters.seats.join(',') : null,
    fuelType: filters.fuelType?.length ? filters.fuelType.join(',') : null,
    features: filters.features?.length ? filters.features.join(',') : null,
    hourly: filters.hourly ? '1' : null,
    delivery: filters.delivery ? '1' : null,
    noCollateral: filters.noCollateral ? '1' : null,
    discount: filters.discount ? '1' : null,
    minSeats: filters.minSeats ?? null,
    priceMin: filters.priceMin ?? null,
    priceMax: filters.priceMax ?? null,
    pickupAt: filters.pickupAt ?? null,
    returnAt: filters.returnAt ?? null,
  };
}
