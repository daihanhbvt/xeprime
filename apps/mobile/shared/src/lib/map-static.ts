import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';
import { XP_TOKENS } from '@xeprime/ui';

import { mapDebug, maskKey } from './map-debug';

/**
 * Ảnh bản đồ TĨNH — Geoapify + nền OpenStreetMap (ADR 0037).
 *
 * ## Ảnh tĩnh dùng ở ĐÂU, và bản đồ tương tác ở đâu
 *
 * Ảnh tĩnh trả lời đúng một câu — "cái ghim đang ở đúng chỗ chưa" — và nó trả lời tức thì, không
 * tốn một byte JavaScript nào. Đó là khối XEM TRƯỚC trong form, và nó vẫn là mặc định.
 *
 * Việc SỬA ghim (phóng to, kéo bản đồ, bấm sang chỗ khác) thì cần một bản đồ thật, và nó sống ở
 * `map-interactive.ts` — Leaflet chạy trong `react-native-webview`, chỉ dựng khi người dùng mở
 * tấm chỉnh ghim. App vẫn KHÔNG cài module bản đồ native nào: một module native vắng mặt trong
 * dev build thì crash lúc CHẠY chứ không phải lúc build. Muốn xem kỹ bằng app bản đồ của máy thì
 * vẫn có `mapAppUrl`.
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

/**
 * ĐÃ có ghim: đủ gần để thấy số nhà. Cùng mức web dùng cho ảnh tĩnh một điểm (`PLACE_ZOOM`).
 */
const PINNED_ZOOM = 16;

/**
 * CHƯA có ghim: mức "một phường", đúng con số `UNPINNED_ZOOM` của `MapPinPicker` bên web.
 *
 * Mở ở mức ghim trong khi tâm chỉ là TÂM MỘT TỈNH là bày ra một khu phố ngẫu nhiên cách chỗ
 * cần tới vài chục km — người dùng phải thu nhỏ ra trước khi hiểu mình đang nhìn đâu.
 */
const UNPINNED_ZOOM = 13;

const MARKER_COLOR = XP_TOKENS['color-primary'];

/**
 * Khoá BẢN ĐỒ công khai — một khoá duy nhất cho cả ảnh tĩnh lẫn tile của bản đồ tương tác
 * (ADR 0037: khác Google, Geoapify không tách hai loại khoá đó).
 *
 * Xuất ra ngoài vì `map-interactive.ts` cần đúng khoá này. Hai bản sao của một dòng đọc env là
 * hai chỗ để quên `.trim()` — và một khoá thừa dấu cách trả về ảnh lỗi 401 chứ không báo gì.
 */
export function geoapifyMapKey(): string | null {
  return process.env.EXPO_PUBLIC_GEOAPIFY_MAP_KEY?.trim() || null;
}

const mapKey = geoapifyMapKey;

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

/**
 * Ảnh VÙNG quanh một tâm, KHÔNG có ghim — dùng khi chưa ai chọn địa điểm.
 *
 * Web luôn dựng bản đồ: chưa có ghim thì nó mở ở tâm tỉnh vừa chọn và chờ một cú bấm
 * (`MapPinPicker` với `fallbackCenter`). App không kéo ghim được, nhưng phần XEM thì phải giống —
 * trước đợt này app ẩn hẳn khối bản đồ cho tới khi có toạ độ, nên người dùng không có gì để
 * đối chiếu trong suốt lúc họ đang gõ địa chỉ, đúng lúc cần nhất.
 *
 * KHÔNG vẽ ghim ở đây, có chủ đích: một cái ghim giữa tâm tỉnh trông y hệt một vị trí đã
 * được xác nhận, trong khi nó chỉ là chỗ bản đồ tình cờ mở ra.
 */
export function mapAreaUrl(center: GeoPoint | null | undefined): string | null {
  const key = mapKey();
  if (!key) {
    mapDebug.urlNull('no-key', `EXPO_PUBLIC_GEOAPIFY_MAP_KEY=${maskKey(key)}`);
    return null;
  }
  if (!isValidGeoPoint(center)) return null;
  return buildUrl(key, center, UNPINNED_ZOOM, null);
}

/** Ảnh xem trước quanh một điểm, CÓ ghim. `null` = chưa cấu hình khoá, hoặc toạ độ không hợp lệ. */
export function mapPreviewUrl(point: GeoPoint | null | undefined): string | null {
  const key = mapKey();
  /*
   * Hai lý do trả `null` phải phân biệt được ở log: thiếu KHOÁ là lỗi bundle (sửa bằng khởi
   * động lại Metro), còn toạ độ hỏng là lỗi DỮ LIỆU (ghim chưa được xác nhận). Gộp chúng vào
   * một `return null` im lặng là bắt người gỡ lỗi đoán giữa hai hướng không liên quan gì nhau.
   */
  if (!key) {
    mapDebug.urlNull('no-key', `EXPO_PUBLIC_GEOAPIFY_MAP_KEY=${maskKey(key)}`);
    return null;
  }
  if (!isValidGeoPoint(point)) {
    /*
     * Đọc toạ độ qua một tham chiếu chụp TRƯỚC lời gọi: `isValidGeoPoint` khai `point is GeoPoint`,
     * nên ở nhánh sai TypeScript thu hẹp `point` xuống `never` — trong khi thứ ta cần in ra chính
     * là cặp số KHÔNG hợp lệ đã tới đây.
     */
    const raw = point as { lat?: unknown; lng?: unknown } | null | undefined;
    mapDebug.urlNull('bad-point', `point=${raw ? `${String(raw.lat)},${String(raw.lng)}` : String(raw)}`);
    return null;
  }

  return buildUrl(key, point, PINNED_ZOOM, point);
}

/**
 * Ghép URL — MỘT chỗ duy nhất cho cả ảnh có ghim lẫn ảnh vùng.
 *
 * Ghép TAY chứ không `URLSearchParams`: tham số `marker` của Geoapify dùng `;` và `:` làm cú
 * pháp riêng, và bộ mã hoá chuẩn sẽ escape chúng thành `%3B`/`%3A` — lúc đó Geoapify không đọc
 * ra ghim nào và trả về một tấm bản đồ trống.
 */
function buildUrl(
  key: string,
  center: GeoPoint,
  zoom: number,
  pin: GeoPoint | null,
): string {
  const params: Record<string, string> = {
    style: STYLE,
    width: String(WIDTH),
    height: String(HEIGHT),
    // `png` thay vì `jpeg` mặc định: nét chữ tên đường sắc hơn hẳn ở mức thu phóng này, và bản đồ
    // là thứ người ta nhìn để ĐỌC tên đường.
    format: 'png',
    center: `lonlat:${lonLat(center)}`,
    zoom: String(zoom),
    ...(pin ? { marker: marker(pin) } : {}),
    apiKey: encodeURIComponent(key),
  };

  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const url = `${STATIC_BASE}?${query}`;
  mapDebug.urlBuilt(url);
  return url;
}

/**
 * Mở điểm này trong GOOGLE MAPS.
 *
 * Bản trước dùng lược đồ `geo:` để hệ điều hành tự chọn app bản đồ mặc định. Nó sai ở iOS: iOS
 * KHÔNG đăng ký `geo:`, nên `Linking.openURL` ném và cú chạm không mở được gì — một nút chết mà
 * chỉ người dùng iPhone gặp.
 *
 * URL `?api=1` của Google là link phổ quát: máy có app Google Maps thì hệ điều hành chuyển thẳng
 * vào app, không có thì mở web. Một đường cho cả hai nền tảng, không nhánh nào không kiểm được.
 *
 * Đây là chỗ DUY NHẤT trong sản phẩm còn trỏ sang Google, và nó chỉ là một liên kết ra ngoài —
 * không phải một bề mặt bản đồ có tính tiền (ADR 0037): dữ liệu bản đồ của XePrime vẫn là
 * Geoapify/OSM ở cả ảnh tĩnh lẫn bản đồ tương tác.
 */
export function mapAppUrl(point: GeoPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
}
