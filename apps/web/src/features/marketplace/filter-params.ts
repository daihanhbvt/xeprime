import { SEARCH_QUERY_MAX_LENGTH } from '@xeprime/domain';
import {
  LISTING_AMENITY_VALUES,
  LISTING_MIN_RATING_VALUES,
  LISTING_SORT_VALUES,
  type ListingAmenity,
} from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { APP_TIME_ZONE, dayjs } from '@/lib/datetime';
import type { QueryParams } from '@/services/api-client';
import type { ListingSort, MarketplaceFilters } from './types';

/**
 * Ngày giờ thuê trên URL: **giờ Việt Nam tới phút**, ISO 8601 không kèm múi giờ —
 * `pickupAt=2026-10-26T21:00`. Khách đọc link là thấy đúng giờ mình chọn.
 *
 * Bên trong app và trên dây tới API vẫn là ISO UTC (`2026-10-26T14:00:00.000Z`): chỉ hai hàm
 * dưới đây đổi qua lại, ở đúng biên URL (`parseFilters` · `applyFilterPatch` · trang xe). Không
 * component nào được đưa chuỗi URL thẳng cho `dayjs()` — nó đọc theo giờ MÁY, tức sai giờ trên
 * server (UTC) và trên máy khách ở nước ngoài.
 */
export const DATETIME_PARAM_FORMAT = 'YYYY-MM-DDTHH:mm';

const DATETIME_KEYS = ['pickupAt', 'returnAt'] as const;

/** Có múi giờ tường minh (`Z`, `+07:00`) — link cũ trước 26/10/2026 mang ISO UTC. */
const HAS_ZONE_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i;
/** Mặt đồng hồ không múi giờ — đọc là giờ Việt Nam. */
const WALL_CLOCK_PARAM = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

/** ISO UTC → tham số URL giờ VN (`2026-10-26T21:00`). Chuỗi không đọc được thì để nguyên. */
export function formatDateTimeParam(iso: string): string {
  const instant = dayjs(iso);
  return instant.isValid() ? instant.tz(APP_TIME_ZONE).format(DATETIME_PARAM_FORMAT) : iso;
}

/**
 * Tham số URL → ISO UTC. Nhận dạng mới (giờ VN) và dạng cũ (ISO có `Z`/offset) để link đã chia
 * sẻ trước đây vẫn mở đúng. Ngày không có thật (`2026-02-30T25:00`) hay chuỗi rác ⇒ `undefined`:
 * bỏ tham số thay vì gửi API một mốc sai hoặc làm cả trang lỗi 400.
 */
export function parseDateTimeParam(raw: string | null | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (HAS_ZONE_SUFFIX.test(value)) {
    const instant = dayjs(value);
    return instant.isValid() ? instant.toISOString() : undefined;
  }
  if (!WALL_CLOCK_PARAM.test(value)) return undefined;
  const instant = dayjs.tz(value, APP_TIME_ZONE);
  // Đọc lại đúng mặt đồng hồ đã gõ — chặn ngày tràn (tháng 13, 30/02) mà Date tự cuộn sang.
  const roundTrip = instant.isValid() && instant.tz(APP_TIME_ZONE).format(DATETIME_PARAM_FORMAT);
  return roundTrip === value.slice(0, DATETIME_PARAM_FORMAT.length)
    ? instant.toISOString()
    : undefined;
}

function isDateTimeKey(key: string): key is (typeof DATETIME_KEYS)[number] {
  return (DATETIME_KEYS as readonly string[]).includes(key);
}

/**
 * Query string của URL bộ lọc. Giữ `:` nguyên dạng (`T21:00` thay vì `T21%3A00`): RFC 3986 cho
 * phép `:` trong query, và trình duyệt/`URLSearchParams` đọc hai dạng như nhau.
 */
export function filterQueryString(params: URLSearchParams): string {
  return params.toString().replace(/%3A/gi, ':');
}

/**
 * Filter → query param gửi API (`/public/listings` và `/public/listings/facets`).
 *
 * ADR 0031: app native có bản riêng ở `apps/mobile/src/api/marketplace/api.ts`. Hai bản phải
 * gửi ĐÚNG một bộ tham số vì chúng hỏi cùng một endpoint — lệch một key là một chiều lọc im
 * lặng biến mất ở một trong hai client.
 *
 * `routeType` KHÔNG có ở đây có chủ đích — nó là ngữ cảnh mang sang yêu cầu thuê, không phải
 * chiều lọc (xe không khai lộ trình phục vụ; lọc theo nó chỉ tạo kết quả rỗng giả).
 */
export function toListingQueryParams(filters: MarketplaceFilters): QueryParams {
  return {
    q: filters.q ?? null,
    vehicleType: filters.vehicleType ?? null,
    serviceType: filters.serviceType ?? null,
    // Tham số chuẩn là MÃ. `province` (tên) chỉ gửi kèm khi chưa có mã — backend quy nó về mã
    // qua bảng bí danh, và URL sinh ra từ đó luôn mang mã.
    provinceCode: filters.provinceCode ?? null,
    province: filters.provinceCode ? null : (filters.province ?? null),
    brand: filters.brand?.length ? filters.brand.join(',') : null,
    bodyType: filters.bodyType?.length ? filters.bodyType.join(',') : null,
    motorbikeCategory: filters.motorbikeCategory?.length
      ? filters.motorbikeCategory.join(',')
      : null,
    seats: filters.seats?.length ? filters.seats.join(',') : null,
    fuelType: filters.fuelType?.length ? filters.fuelType.join(',') : null,
    features: filters.features?.length ? filters.features.join(',') : null,
    transmission: filters.transmission?.length ? filters.transmission.join(',') : null,
    // Toggle tiện ích: `1` khi bật, vắng khi tắt — đúng bộ `LISTING_AMENITY` (xem `BOOLEAN_KEYS`).
    ...Object.fromEntries(BOOLEAN_KEYS.map((key) => [key, filters[key] ? '1' : null])),
    instantBook: filters.instantBook ? '1' : null,
    minRating: filters.minRating ?? null,
    minSeats: filters.minSeats ?? null,
    priceMin: filters.priceMin ?? null,
    priceMax: filters.priceMax ?? null,
    pickupAt: filters.pickupAt ?? null,
    returnAt: filters.returnAt ?? null,
  };
}

/**
 * Đọc/ghi filter marketplace ↔ URL searchParams (ADR 0004) — thuần hàm, không đụng
 * next/navigation để unit-test được. Quy ước wire: mảng = CSV (`sedan,suv`), boolean = `1`.
 */

const ARRAY_KEYS = [
  'brand',
  'bodyType',
  // Chiều lọc của xe máy — đối xứng với `bodyType`, nên nó cũng phải sống trong URL: một bộ lọc
  // không chia sẻ được bằng link là một bộ lọc mất khi tải lại trang (ADR 0004).
  'motorbikeCategory',
  'seats',
  'fuelType',
  'features',
  'transmission',
] as const;
/**
 * Boolean trên URL = đúng bộ toggle tiện ích của panel Bộ lọc (`LISTING_AMENITY`, key trùng tên
 * query param). Đọc từ hằng dùng chung thay vì chép lại: thêm một tiện ích mà quên chỗ này là
 * một bộ lọc bấm được nhưng mất khi tải lại trang, và "Xoá bộ lọc" không xoá được nó.
 */
const BOOLEAN_KEYS: readonly ListingAmenity[] = LISTING_AMENITY_VALUES;
const NUMBER_KEYS = ['minSeats', 'priceMin', 'priceMax', 'page', 'limit'] as const;
const STRING_KEYS = [
  // Từ khoá (09/10, quay lại sau lần gỡ 17/08): lý do gỡ là "gõ không dấu / tách chữ số thì
  // không ra xe" — server nay gấp chuỗi trước khi so (`searchTokens`), nên khớp cả hai cách gõ.
  'q',
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
  'instantBook',
  'minRating',
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
  // URL nói giờ VN, phần còn lại của app nói ISO UTC — đổi ngay tại cửa vào.
  for (const key of DATETIME_KEYS) {
    const iso = parseDateTimeParam(filters[key]);
    if (iso) filters[key] = iso;
    else delete filters[key];
  }
  // Link tự sửa tay có thể dài hơn trần của API — cắt thay vì để cả trang thành lỗi 400; chuỗi
  // chỉ toàn khoảng trắng thì coi như không có từ khoá.
  if (filters.q !== undefined) {
    const q = filters.q.trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
    if (q) filters.q = q;
    else delete filters.q;
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
  // "Không cần xác nhận" — không thuộc bộ tiện ích của tin đăng (nó là năng lực ĐẶT NGAY theo
  // dịch vụ), nên đọc riêng thay vì chen vào `LISTING_AMENITY`.
  if (searchParams.get('instantBook') === '1') filters.instantBook = true;
  // Mức sao chỉ nhận đúng các mốc API chấp nhận — link sửa tay `minRating=3.7` bị bỏ qua thay vì
  // biến cả trang thành lỗi 400.
  const minRating = Number(searchParams.get('minRating'));
  if ((LISTING_MIN_RATING_VALUES as readonly number[]).includes(minRating)) {
    filters.minRating = minRating;
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
      params.set(key, isDateTimeKey(key) ? formatDateTimeParam(String(value)) : String(value));
    }
  }
  if (!('page' in patch)) params.delete('page');
}

/**
 * URL trang kết quả `/search` mang sẵn một bộ lọc — MỘT chỗ dựng cho mọi lối vào chợ (chân trang,
 * "Loại xe", "Địa điểm nổi bật", "Xem tất cả xe"). Dùng chính `applyFilterPatch` mà `/search` đọc
 * ngược lại, nên không nơi nào giữ bản sao thứ hai của contract URL. Không tham số ⇒ `/search` trần.
 */
export function marketplaceSearchHref(patch: Partial<MarketplaceFilters>): string {
  const params = new URLSearchParams();
  applyFilterPatch(params, patch);
  const qs = filterQueryString(params);
  return qs ? `${ROUTES.SEARCH}?${qs}` : ROUTES.SEARCH;
}
