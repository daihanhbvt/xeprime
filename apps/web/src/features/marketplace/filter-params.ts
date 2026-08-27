import { LISTING_SORT_VALUES } from '@xeprime/types';
import { toListingQueryParams } from '@xeprime/api-client';
import type { ListingSort, MarketplaceFilters } from './types';

/**
 * Serialize filter → query API sống ở `@xeprime/api-client` (native gọi cùng endpoint với cùng
 * bộ tham số); parse/ghi URL bên dưới thì ở lại đây vì chỉ web có thanh địa chỉ.
 */
export { toListingQueryParams };

/**
 * Đọc/ghi filter marketplace ↔ URL searchParams (ADR 0004) — thuần hàm, không đụng
 * next/navigation để unit-test được. Quy ước wire: mảng = CSV (`sedan,suv`), boolean = `1`.
 */

const ARRAY_KEYS = ['brand', 'bodyType', 'seats', 'fuelType', 'features'] as const;
const BOOLEAN_KEYS = ['hourly', 'delivery', 'noCollateral', 'discount'] as const;
const NUMBER_KEYS = ['minSeats', 'priceMin', 'priceMax', 'page', 'limit'] as const;
// Từ khoá `q` đã bị BỎ khỏi contract FE (yêu cầu 17/08 — gõ sai key là không ra xe, không thân
// thiện): mọi lối vào tìm kiếm đều có cấu trúc (dịch vụ / loại xe / địa điểm / thời gian).
// Link cũ còn mang `q` thì param bị lơ đi — kết quả RỘNG HƠN chứ không thành bộ lọc tàng hình.
const STRING_KEYS = [
  'vehicleType',
  'serviceType',
  // Lộ trình có tài xế (17/08) — NGỮ CẢNH mang sang yêu cầu thuê, KHÔNG gửi API listings
  // (xe không khai lộ trình phục vụ; lọc theo nó chỉ tạo kết quả rỗng giả).
  'routeType',
  'provinceCode',
  // `province` (tên) chỉ còn để ĐỌC link cũ; xem `parseFilters`.
  'province',
  'pickupAt',
  'returnAt',
] as const;

/**
 * Các key thuộc panel Bộ lọc — "Xoá bộ lọc" reset đúng nhóm này, giữ nguyên ngữ cảnh tìm kiếm
 * (địa điểm / ngày giờ / loại xe / dịch vụ).
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

  // Có `provinceCode` thì `province` (tên) không còn ý nghĩa: giữ lại chỉ tạo nguy cơ hai nguồn
  // địa điểm mâu thuẫn trên cùng một URL.
  if (filters.provinceCode) delete filters.province;

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
