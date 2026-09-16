import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';
import { XP_TOKENS } from '@xeprime/ui';

/**
 * Dựng URL ảnh bản đồ tĩnh (Geoapify Static Maps API, dữ liệu OpenStreetMap — ADR 0037).
 *
 * Vì sao là một tấm ẢNH chứ không phải bản đồ tương tác: bản đồ ở đây chỉ để XEM — ghim một
 * điểm, hoặc chỉ ra hai đầu của một chuyến giao. Một `<img>` làm đúng việc đó với **không một
 * dòng JavaScript nào của bên thứ ba**, tải lười được, và nhẹ hơn cả `<iframe>` mà bản Google
 * trước đây dùng. Ngày nào cần kéo ghim thì đã có `MapPinPicker` — đó là một quyết định riêng
 * và một thư viện riêng.
 *
 * Key ở đây nằm LỘ THIÊN trong HTML — đó là bản chất của ảnh tĩnh, không phải sơ suất. Vì thế
 * nó phải là một key RIÊNG, khoá theo HTTP referrer trong Geoapify Projects. Key gọi
 * geocoding/routing là `GEOAPIFY_API_KEY` của backend và không bao giờ xuất hiện ở đây.
 */
const STATIC_BASE = 'https://maps.geoapify.com/v1/staticmap';

/** Kiểu nền. `osm-bright` là bản sáng, nhiều nhãn đường — hợp với nền giấy của XePrime. */
const STYLE = 'osm-bright';

/**
 * Kích thước ảnh YÊU CẦU, không phải kích thước hiển thị.
 *
 * Khung bản đồ trên trang co giãn theo bề ngang, còn ảnh tĩnh thì phải chốt số pixel lúc gọi.
 * 1000×500 (tỉ lệ 2:1) đủ nét cho mọi khung hiện có sau khi `object-fit: cover` cắt hai bên, và
 * vẫn nằm dưới ngưỡng mà một tấm ảnh trang danh sách nên nặng.
 */
const IMAGE_WIDTH = 1000;
const IMAGE_HEIGHT = 500;

/** Đủ gần để thấy số nhà và nhận ra ngã tư quanh đó. */
const PLACE_ZOOM = 16;

/**
 * Nới khung bao quanh hai đầu chuyến, tính theo phần trăm của chính khoảng cách giữa chúng.
 *
 * Không phải trang trí: ảnh được `object-fit: cover` cắt bớt cho vừa khung thật trên trang, nên
 * một cái ghim nằm sát mép ảnh sẽ bị cắt mất. Nới 25% đẩy cả hai ghim vào vùng an toàn ở giữa.
 */
const ROUTE_BBOX_PADDING = 0.25;

/** Sàn cho phần nới, tính bằng độ. Hai điểm gần nhau sẽ cho khung bao gần như bằng không. */
const ROUTE_BBOX_MIN_PADDING_DEG = 0.004;

/** Màu ghim = màu thương hiệu. Đây là tham số URL chứ không phải CSS, nên đọc thẳng từ token. */
const MARKER_COLOR = XP_TOKENS['color-primary'];

function mapKey(): string | null {
  return process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY || null;
}

/** Bản đồ có dùng được không — nơi gọi ẩn hẳn khối bản đồ thay vì hiện một khung vỡ. */
export function isMapConfigured(): boolean {
  return mapKey() !== null;
}

/**
 * Tự nối chuỗi truy vấn thay vì `URLSearchParams`.
 *
 * Cú pháp ghim của Geoapify dùng `:` `,` `;` `|` làm dấu phân cách NGAY TRONG giá trị, còn
 * `URLSearchParams` thì phần trăm-hoá tất cả chúng. Máy chủ giải mã lại được, nhưng đây là chỗ
 * không đáng đánh cược: mọi giá trị động ở file này đều là số hoặc mã màu, nên nối tay là an
 * toàn và đọc ra đúng thứ tài liệu của họ mô tả.
 */
function buildUrl(params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${STATIC_BASE}?${query}`;
}

/** Geoapify dùng thứ tự **lon,lat** ở `center` và `marker` — ngược với cách người ta hay đọc. */
const lonLat = (p: GeoPoint): string => `${p.lng},${p.lat}`;

/**
 * Một cái ghim, kiểu `material` màu thương hiệu.
 *
 * `#` phải thành `%23`: để nguyên thì phần còn lại của URL biến thành fragment và máy chủ nhận
 * được một tham số cụt.
 */
function marker(point: GeoPoint, text?: string): string {
  const color = MARKER_COLOR.replace('#', '%23');
  const label = text ? `;text:${text};contentcolor:%23ffffff;contentsize:22` : '';
  return `lonlat:${lonLat(point)};type:material;color:${color};size:44${label}`;
}

const baseParams = (key: string): Record<string, string> => ({
  style: STYLE,
  width: String(IMAGE_WIDTH),
  height: String(IMAGE_HEIGHT),
  // `format=jpeg` là mặc định và nhẹ hơn; `png` cho nét chữ trên nhãn đường sắc hơn hẳn ở mức
  // thu phóng này, và bản đồ là thứ người ta nhìn để ĐỌC tên đường.
  format: 'png',
  apiKey: encodeURIComponent(key),
});

/**
 * Ghim MỘT điểm.
 *
 * Hàm này CHỈ nhận toạ độ, không nhận địa chỉ chữ. Truyền địa chỉ vào một API bản đồ là để nó
 * đoán lại một lần nữa, và nó có thể ra chỗ khác với con số mà backend đã dùng để tính phí.
 */
export function mapPlaceUrl(point: GeoPoint | null | undefined): string | null {
  const key = mapKey();
  if (!key || !isValidGeoPoint(point)) return null;
  return buildUrl({
    ...baseParams(key),
    center: `lonlat:${lonLat(point)}`,
    zoom: String(PLACE_ZOOM),
    marker: marker(point),
  });
}

/**
 * Hai đầu của một chuyến giao xe: ghim `1` ở điểm nhận, ghim `2` ở địa chỉ khách.
 *
 * **Cố ý KHÔNG vẽ đường nối.** Ảnh tĩnh của Geoapify vẽ được một tuyến, nhưng chỉ khi được đưa
 * sẵn hình học tuyến đó — mà `geo_route_cache` chỉ lưu số ki-lô-mét. Vẽ một đoạn thẳng giữa hai
 * ghim thì còn tệ hơn: nó trông y hệt một lộ trình trong khi nó là đường chim bay, và quãng
 * đường THẬT đã nằm ngay dòng chữ phía trên với thẩm quyền của `GeoService`. Hai cái ghim nói
 * đúng thứ người xem cần biết ở đây — "từ đâu tới đâu" — và không hứa gì thêm.
 */
export function mapRouteUrl(
  origin: GeoPoint | null | undefined,
  destination: GeoPoint | null | undefined,
): string | null {
  const key = mapKey();
  if (!key || !isValidGeoPoint(origin) || !isValidGeoPoint(destination)) return null;

  const pad = (a: number, b: number): number =>
    Math.max(Math.abs(a - b) * ROUTE_BBOX_PADDING, ROUTE_BBOX_MIN_PADDING_DEG);
  const padLat = pad(origin.lat, destination.lat);
  const padLng = pad(origin.lng, destination.lng);

  const minLng = Math.min(origin.lng, destination.lng) - padLng;
  const maxLng = Math.max(origin.lng, destination.lng) + padLng;
  const minLat = Math.min(origin.lat, destination.lat) - padLat;
  const maxLat = Math.max(origin.lat, destination.lat) + padLat;

  return buildUrl({
    ...baseParams(key),
    // `rect` đi theo thứ tự góc TRÊN-TRÁI rồi DƯỚI-PHẢI: lon1,lat1,lon2,lat2.
    area: `rect:${minLng},${maxLat},${maxLng},${minLat}`,
    marker: `${marker(origin, '1')}|${marker(destination, '2')}`,
  });
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
