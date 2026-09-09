import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';

/**
 * Xem trước vị trí bằng **Google Maps Static API** — bản native của `lib/map-embed.ts` bên web.
 *
 * Web nhúng `<iframe>` Maps Embed API. Native không có iframe, và một bản đồ TƯƠNG TÁC thì phải
 * kéo `react-native-maps` vào: một native module, tức một bản dev build mới cho mọi máy, cho một
 * khối mà việc duy nhất là KIỂM lại cái ghim backend vừa tra ra từ địa chỉ. Static API trả đúng
 * một tấm ảnh — hiện được ngay trong bản build hiện tại, không thêm phụ thuộc nào, và chạm vào
 * vẫn mở bản đồ THẬT của hệ điều hành, thứ zoom và chỉ đường tốt hơn mọi khung nhúng.
 *
 * Key nằm trong bundle của app (`EXPO_PUBLIC_*`) nên nó phải là một key RIÊNG: chỉ bật Maps
 * Static API, có hạn mức chặn trên. Cùng hạng với `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` của web,
 * và KHÔNG BAO GIỜ là `GOOGLE_MAPS_SERVER_KEY` (Geocoding + Routes, có tính tiền theo lượt gọi,
 * chỉ backend được cầm). Cách khoá key: `docs/third-party-keys.md` §4.
 *
 * Thiếu key thì mọi hàm ở đây trả `null` và nơi gọi lùi về nút "Mở bản đồ" — cùng cách web ẩn
 * hẳn khối bản đồ thay vì hiện một khung vỡ.
 */
const STATIC_BASE = 'https://maps.googleapis.com/maps/api/staticmap';

/** Tỉ lệ khung xem trước. Nơi gọi dựng ô đựng theo đúng số này. */
export const MAP_PREVIEW_RATIO = 2;

/**
 * Bề rộng ảnh xin từ Google — 640 là TRẦN của bậc tiêu chuẩn, `scale=2` nhân đôi số điểm ảnh
 * thật (1280×640) để ảnh không rỗ trên màn hình mật độ cao. Xin quá trần là 400 Bad Request.
 */
const WIDTH = 640;
const HEIGHT = WIDTH / MAP_PREVIEW_RATIO;
const SCALE = 2;

/** Đủ gần để đọc được tên đường quanh ghim, đủ xa để thấy mình đang ở khu nào. */
const ZOOM = 16;

function staticKey(): string | null {
  return process.env.EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY?.trim() || null;
}

const coordParam = (point: GeoPoint): string => `${point.lat},${point.lng}`;

/**
 * Toạ độ từ hai giá trị rời của API.
 *
 * Nhận cả `string` vì `Decimal` đi trên dây dưới dạng chuỗi (ADR 0007). Gom phép kiểm vào một
 * chỗ vì mọi nơi hiện bản đồ đều phải làm đúng nó, và một chỗ quên kiểm là một cái ghim ở Vịnh
 * Guinea.
 */
export function toGeoPoint(
  lat: string | number | null | undefined,
  lng: string | number | null | undefined,
): GeoPoint | null {
  if (lat == null || lng == null) return null;
  const point = { lat: Number(lat), lng: Number(lng) };
  return isValidGeoPoint(point) ? point : null;
}

/** Ảnh bản đồ có ghim. `null` khi thiếu key hoặc toạ độ hỏng — nơi gọi lùi về nút mở bản đồ. */
export function mapPreviewUrl(point: GeoPoint | null | undefined): string | null {
  const key = staticKey();
  if (!key || !isValidGeoPoint(point)) return null;

  const url = new URL(STATIC_BASE);
  url.searchParams.set('center', coordParam(point));
  url.searchParams.set('zoom', String(ZOOM));
  url.searchParams.set('size', `${WIDTH}x${HEIGHT}`);
  url.searchParams.set('scale', String(SCALE));
  /*
   * Ghim ĐỎ, không phải gold thương hiệu: nền bản đồ của Google đã đầy vàng và cam (đường lớn,
   * đường cao tốc), nên một cái ghim gold lẫn thẳng vào nền — mà cả khối này tồn tại để người
   * dùng nhìn ra cái ghim nằm ở đâu.
   */
  url.searchParams.set('markers', `color:red|${coordParam(point)}`);
  url.searchParams.set('language', 'vi');
  url.searchParams.set('region', 'VN');
  url.searchParams.set('key', key);
  return url.toString();
}

/**
 * Mở trong ứng dụng bản đồ của máy — KHÔNG cần key, đây là URL công khai của Google Maps.
 *
 * Vì thế nó luôn dùng được, kể cả khi chưa khai key xem trước.
 */
export function mapAppUrl(point: GeoPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${coordParam(point)}`;
}
