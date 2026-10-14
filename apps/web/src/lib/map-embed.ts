import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';
import type { AppLocale } from '@/i18n/config';

/**
 * Bản đồ Google trên web — khoá trình duyệt + URL nhúng (Maps Embed API · ADR 0059).
 *
 * Vì sao bản đồ XEM-ĐƯỢC là `<iframe>` Embed chứ không phải ảnh Static Maps hay Maps JavaScript
 * API: Embed API **miễn phí, không giới hạn lượt**, còn hai thứ kia trừ vào hạn mức tính tiền
 * theo từng lượt xem. Bản đồ điểm nhận xe nằm trên trang xe công khai — trang có lượt xem lớn
 * nhất của cả sản phẩm — nên đây là chỗ chọn sai sẽ thành một dòng chi định kỳ. Embed cũng không
 * kéo một byte JavaScript nào vào bundle của mình, và `loading="lazy"` vẫn chạy.
 *
 * Ngày nào cần KÉO ghim thì có `google-maps-loader.ts` (Maps JavaScript API) — chỉ nạp khi ô
 * chỉnh ghim thật sự mở.
 *
 * Key ở đây nằm LỘ THIÊN trong HTML — đó là bản chất của bản đồ phía trình duyệt, không phải sơ
 * suất. Vì thế nó là key RIÊNG, khoá theo HTTP referrer và chỉ bật Maps Embed API + Maps
 * JavaScript API. Key gọi Geocoding/Places/Routes là `GOOGLE_MAPS_SERVER_KEY` của backend và
 * không bao giờ xuất hiện ở đây.
 */
const EMBED_BASE = 'https://www.google.com/maps/embed/v1';

/** Đủ gần để thấy số nhà và nhận ra ngã tư quanh đó. */
const PLACE_ZOOM = 16;

/** Sản phẩm chỉ chạy ở Việt Nam — khoá vùng để tên địa danh và biên giới hiện theo Việt Nam. */
const MAP_REGION = 'VN';

export function googleMapsBrowserKey(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || null;
}

/** Bản đồ có dùng được không — nơi gọi ẩn hẳn khối bản đồ thay vì hiện một khung vỡ. */
export function isMapConfigured(): boolean {
  return googleMapsBrowserKey() !== null;
}

const coordParam = (point: GeoPoint): string => `${point.lat},${point.lng}`;

/**
 * Ghim MỘT điểm.
 *
 * Hàm này CHỈ nhận toạ độ, không nhận địa chỉ chữ. Truyền địa chỉ vào là để Google đoán lại một
 * lần nữa, và nó có thể ra chỗ khác với con số mà backend đã dùng để tính phí.
 *
 * `locale` chỉ đổi NHÃN trên bản đồ (nút, tên địa danh có bản dịch) — toạ độ không đổi.
 */
export function mapPlaceUrl(point: GeoPoint | null | undefined, locale: AppLocale): string | null {
  const key = googleMapsBrowserKey();
  if (!key || !isValidGeoPoint(point)) return null;
  const url = new URL(`${EMBED_BASE}/place`);
  url.searchParams.set('key', key);
  url.searchParams.set('q', coordParam(point));
  url.searchParams.set('zoom', String(PLACE_ZOOM));
  url.searchParams.set('language', locale);
  url.searchParams.set('region', MAP_REGION);
  return url.toString();
}

/**
 * Mở toạ độ trên Google Maps (tab mới, hoặc app Google Maps trên điện thoại).
 *
 * Link phổ quát `maps/search/?api=1` — không cần key, không tính tiền, và là dạng Google cam kết
 * giữ ổn định cho liên kết từ bên ngoài.
 */
export function mapExternalUrl(point: GeoPoint): string {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', coordParam(point));
  return url.toString();
}

/**
 * Toạ độ từ hai giá trị rời (API trả `latitude`/`longitude` tách nhau, có thể null).
 *
 * Gom vào một chỗ vì mọi nơi hiện bản đồ đều phải làm đúng phép kiểm này, và một chỗ quên kiểm
 * là một ghim ở Vịnh Guinea.
 */
export function toGeoPoint(
  lat: number | null | undefined,
  lng: number | null | undefined,
): GeoPoint | null {
  if (lat == null || lng == null) return null;
  const point = { lat, lng };
  return isValidGeoPoint(point) ? point : null;
}
