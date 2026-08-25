import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';

/**
 * Dựng URL nhúng bản đồ (Google Maps Embed API).
 *
 * Vì sao là `<iframe>` chứ không phải Maps JavaScript API: bản đồ ở đây chỉ để XEM — ghim một
 * điểm, hoặc vẽ một tuyến. Embed API làm đúng việc đó, không tốn hạn mức tính tiền (khác hẳn
 * map load của Maps JavaScript API), và không kéo theo một dòng JavaScript nào của bên thứ ba.
 * Ngày nào cần kéo ghim thì mới phải đổi, và đó là một quyết định riêng.
 *
 * Key ở đây nằm LỘ THIÊN trong HTML — đó là bản chất của Embed API, không phải sơ suất. Vì thế
 * nó phải là một key RIÊNG, khoá theo HTTP referrer và chỉ bật Maps Embed API. Key gọi
 * Geocoding/Routes là `GOOGLE_MAPS_SERVER_KEY` của backend và không bao giờ xuất hiện ở đây.
 */
const EMBED_BASE = 'https://www.google.com/maps/embed/v1';

function embedKey(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY || null;
}

/** Bản đồ có dùng được không — nơi gọi ẩn hẳn khối bản đồ thay vì hiện một khung vỡ. */
export function isMapEmbedConfigured(): boolean {
  return embedKey() !== null;
}

const coordParam = (point: GeoPoint): string => `${point.lat},${point.lng}`;

/**
 * Ghim MỘT điểm.
 *
 * `label` chỉ là chữ hiện trên ghim; toạ độ mới là thứ quyết định vị trí. Truyền địa chỉ chữ vào
 * đây thay cho toạ độ sẽ khiến Google tự đoán lại một lần nữa và có thể ra chỗ khác với con số
 * mà backend đã tính phí — nên hàm này CHỈ nhận toạ độ.
 */
export function mapPlaceUrl(point: GeoPoint | null | undefined): string | null {
  const key = embedKey();
  if (!key || !isValidGeoPoint(point)) return null;
  const url = new URL(`${EMBED_BASE}/place`);
  url.searchParams.set('key', key);
  url.searchParams.set('q', coordParam(point));
  url.searchParams.set('language', 'vi');
  url.searchParams.set('region', 'VN');
  return url.toString();
}

/**
 * Vẽ tuyến giữa hai điểm.
 *
 * Tuyến hiển thị và con số km trên màn hình đến từ HAI nguồn khác nhau (Embed API vẽ, Routes API
 * đo ở backend), nên chúng có thể lệch nhau chút ít. Chấp nhận được vì con số là thứ có thẩm
 * quyền còn bản đồ chỉ để người dùng thấy "đại khái đi đường nào" — nhưng đừng đọc quãng đường
 * từ bản đồ này ra và tưởng đó là số đã tính phí.
 */
export function mapDirectionsUrl(
  origin: GeoPoint | null | undefined,
  destination: GeoPoint | null | undefined,
): string | null {
  const key = embedKey();
  if (!key || !isValidGeoPoint(origin) || !isValidGeoPoint(destination)) return null;
  const url = new URL(`${EMBED_BASE}/directions`);
  url.searchParams.set('key', key);
  url.searchParams.set('origin', coordParam(origin));
  url.searchParams.set('destination', coordParam(destination));
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('language', 'vi');
  url.searchParams.set('region', 'VN');
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
