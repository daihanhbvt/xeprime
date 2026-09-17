import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';
import { XP_TOKENS } from '@xeprime/ui';

/**
 * Ảnh bản đồ TĨNH — Geoapify + nền OpenStreetMap (ADR 0037).
 *
 * ## Vì sao ảnh tĩnh chứ không phải bản đồ tương tác
 *
 * App native KHÔNG cài thư viện bản đồ nào. Ở đây bản đồ chỉ trả lời một câu — "cái ghim đang ở
 * đúng chỗ chưa" — và một ảnh trả lời xong câu đó. Thêm một module native cho việc này là thêm
 * một thứ có thể vắng trong dev build, và một module native vắng mặt thì crash lúc CHẠY chứ
 * không phải lúc build. Muốn xem kỹ thì mở app bản đồ của máy (`mapAppUrl`).
 *
 * ## Vì sao không còn Google
 *
 * Nền tảng đã chuyển provider geo sang Geoapify (`GeoapifyGeoProvider` ở API). Giữ Google riêng
 * cho ảnh tĩnh nghĩa là hai nhà cung cấp cho cùng một bản đồ: ghim của người dùng do Geoapify
 * geocode ra, còn ảnh họ nhìn để xác nhận lại do Google vẽ — hai bộ dữ liệu đường khác nhau, và
 * sai lệch giữa chúng rơi đúng vào lúc người dùng đang kiểm tra.
 *
 * ## Khoá
 *
 * `EXPO_PUBLIC_GEOAPIFY_MAP_KEY` — khoá CÔNG KHAI, chỉ dùng cho Static Maps, phải đặt hạn mức
 * chặn trên ở bảng điều khiển Geoapify. Nó nằm trong bundle nên coi như ai cũng đọc được; KHÔNG
 * bao giờ dùng khoá server (`GEOAPIFY_API_KEY`, tính tiền theo lượt geocode) ở đây.
 *
 * Ghi nguồn ODbL: Geoapify NUNG SẴN dòng "Powered by Geoapify | © OpenMapTiles © OpenStreetMap
 * contributors" vào chính tấm ảnh, nên nơi hiển thị KHÔNG cần in thêm — thêm một dòng nữa bên
 * dưới là nói hai lần cùng một câu. Xác minh bằng ảnh thật ngày 16/09/2026; nếu đổi provider thì
 * kiểm lại, vì lúc đó ghi nguồn thành trách nhiệm của phía hiển thị.
 */
const STATIC_BASE = 'https://maps.geoapify.com/v1/staticmap';

/** Cùng style với web (`osm-bright`) — một chiếc xe không được trông khác nhau ở hai client. */
const STYLE = 'osm-bright';

export const MAP_PREVIEW_RATIO = 2;

const WIDTH = 640;
const HEIGHT = WIDTH / MAP_PREVIEW_RATIO;

const ZOOM = 16;

const MARKER_COLOR = XP_TOKENS['color-primary'];

function mapKey(): string | null {
  return process.env.EXPO_PUBLIC_GEOAPIFY_MAP_KEY?.trim() || null;
}

/** `true` khi app dựng được ảnh bản đồ — nơi gọi dùng nó để chọn giữa ảnh và dòng chữ địa chỉ. */
export function isMapConfigured(): boolean {
  return mapKey() !== null;
}

/**
 * Geoapify nhận `lon,lat` — NGƯỢC thứ tự với Google (`lat,lng`) và ngược với chính `GeoPoint`.
 *
 * Đảo nhầm không gây lỗi nào: nó trả về một ảnh hợp lệ của một chỗ khác hẳn, thường là giữa biển.
 */
const lonLat = (p: GeoPoint): string => `${p.lng},${p.lat}`;

/**
 * Ghim `material` màu thương hiệu.
 *
 * `#` phải thành `%23` BẰNG TAY: giá trị này nằm trong một tham số đã ghép chuỗi, và một `#` thô
 * cắt phần còn lại của URL thành fragment — ảnh vẫn trả về, chỉ là không có ghim nào.
 */
function marker(point: GeoPoint): string {
  const color = MARKER_COLOR.replace('#', '%23');
  return `lonlat:${lonLat(point)};type:material;color:${color};size:44`;
}

/**
 * Toạ độ từ hai giá trị rời (form giữ chúng dạng chuỗi) — `null` nếu thiếu hoặc ngoài khoảng hợp lệ.
 */
export function toGeoPoint(
  lat: string | number | null | undefined,
  lng: string | number | null | undefined,
): GeoPoint | null {
  if (lat == null || lng == null) return null;
  const point = { lat: Number(lat), lng: Number(lng) };
  return isValidGeoPoint(point) ? point : null;
}

/** Ảnh xem trước quanh một điểm. `null` = chưa cấu hình khoá, hoặc toạ độ không hợp lệ. */
export function mapPreviewUrl(point: GeoPoint | null | undefined): string | null {
  const key = mapKey();
  if (!key || !isValidGeoPoint(point)) return null;

  /*
   * Ghép TAY chứ không `URLSearchParams`: tham số `marker` của Geoapify dùng `;` và `:` làm cú
   * pháp riêng, và bộ mã hoá chuẩn sẽ escape chúng thành `%3B`/`%3A` — lúc đó Geoapify không đọc
   * ra ghim nào và trả về một tấm bản đồ trống.
   */
  const params: Record<string, string> = {
    style: STYLE,
    width: String(WIDTH),
    height: String(HEIGHT),
    // `png` thay vì `jpeg` mặc định: nét chữ tên đường sắc hơn hẳn ở mức thu phóng này, và bản đồ
    // là thứ người ta nhìn để ĐỌC tên đường.
    format: 'png',
    center: `lonlat:${lonLat(point)}`,
    zoom: String(ZOOM),
    marker: marker(point),
    apiKey: encodeURIComponent(key),
  };

  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${STATIC_BASE}?${query}`;
}

/**
 * Mở điểm này trong app bản đồ của MÁY.
 *
 * `geo:` là lược đồ chuẩn của Android/iOS: nó để HỆ ĐIỀU HÀNH chọn app bản đồ mà người dùng đã
 * đặt mặc định, thay vì ép mở Google Maps — cùng tinh thần với việc web chuyển link ra
 * OpenStreetMap. Tham số `q` giữ ghim đúng toạ độ ở những app bỏ qua phần trước dấu `?`.
 */
export function mapAppUrl(point: GeoPoint): string {
  const coords = `${point.lat},${point.lng}`;
  return `geo:${coords}?q=${coords}`;
}
