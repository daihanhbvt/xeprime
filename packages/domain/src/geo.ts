/**
 * Hình học vị trí dùng chung — web, app native và backend nói cùng một thứ về khoảng cách.
 *
 * File này KHÔNG gọi mạng và không biết nhà cung cấp bản đồ nào tồn tại. Nó chỉ có ba việc:
 * đo đường chim bay, chuẩn hoá địa chỉ thành khoá cache, và làm tròn toạ độ. Phần gọi
 * Geocoding/Routes nằm ở `apps/api/src/modules/geo` vì nó cần API key — thứ không bao giờ được
 * có mặt trong package dùng chung (CLAUDE.md §5).
 */

/**
 * Kết quả tra bản đồ (toạ độ, quãng đường) được giữ trong cache tối đa bấy nhiêu ngày.
 *
 * Mỗi lượt hỏi nhà cung cấp là tiền (Vietmap tính theo giao dịch — ADR 0061), và quãng đường
 * giữa hai điểm cố định gần như không đổi trong vài tháng — nên giữ lâu là tiết kiệm thật. 90 ngày vẫn đủ
 * ngắn để một con đường mới mở hay một địa chỉ đổi tên không nằm sai mãi trong cache. Một con số
 * dùng ở hai nơi — API thôi đọc bản ghi quá hạn, worker xoá hẳn nó — nên nó sống ở đây.
 */
export const GEO_CACHE_TTL_DAYS = 90;

/** Một điểm trên bản đồ. Luôn là độ thập phân WGS84, không phải độ-phút-giây. */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

const EARTH_RADIUS_KM = 6371;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Khoảng cách ĐƯỜNG CHIM BAY giữa hai điểm (km).
 *
 * Dùng làm **bộ lọc trước**, không phải để tính phí: đường chim bay LUÔN ngắn hơn hoặc bằng
 * đường bộ, nên `haversineKm > bán kính` là bằng chứng chắc chắn rằng đường bộ cũng vượt bán
 * kính — kết luận được ngay mà không tốn một request Routes API nào. Chiều ngược lại thì
 * không suy được, và đó là lý do phí giao vẫn phải hỏi đường bộ thật.
 */
export function haversineKm(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Địa chỉ người dùng gõ → khoá cache ổn định.
 *
 * Mục tiêu là gộp những chuỗi CHỈ khác nhau ở cách gõ về cùng một khoá: thừa khoảng trắng,
 * thừa dấu phẩy, viết hoa khác nhau. Cố ý **giữ nguyên dấu tiếng Việt** — "Đông" và "Dong" là
 * hai nơi khác nhau ở đủ nhiều tỉnh để việc bỏ dấu trở thành nguồn sai địa chỉ, và tiết kiệm
 * được vài lượt cache không đáng đánh đổi bằng giao nhầm nhà.
 */
export function normalizeAddressKey(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s,;]+/g, ' ')
    .replace(/[.\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Làm tròn toạ độ để hai lần hỏi cùng một chỗ trúng chung một khoá cache.
 *
 * Mặc định 3 chữ số ≈ lưới 110m. Bậc phí giao tính theo km nên sai số đó không bao giờ đủ để
 * nhảy bậc, trong khi nó gộp được mọi lần khách bấm lại nút tính phí.
 */
export function roundCoord(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Toạ độ có nằm trong khoảng hợp lệ không — chặn dữ liệu rác trước khi nó thành URL bản đồ. */
export function isValidGeoPoint(point: GeoPoint | null | undefined): point is GeoPoint {
  return (
    point != null &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180 &&
    // (0,0) là Vịnh Guinea. Ở một sản phẩm chỉ chạy ở Việt Nam, nó luôn là dữ liệu hỏng.
    !(point.lat === 0 && point.lng === 0)
  );
}

/**
 * Toạ độ từ hai giá trị rời (API trả `latitude`/`longitude` tách nhau, có thể null).
 *
 * Gom vào một chỗ vì mọi nơi trỏ ra bản đồ đều phải làm đúng phép kiểm này, và một chỗ quên kiểm
 * là một liên kết dẫn khách tới Vịnh Guinea.
 */
export function toGeoPoint(
  lat: number | null | undefined,
  lng: number | null | undefined,
): GeoPoint | null {
  if (lat == null || lng == null) return null;
  const point = { lat, lng };
  return isValidGeoPoint(point) ? point : null;
}

/**
 * Mở một toạ độ trên Google Maps (tab mới, hoặc app Google Maps trên điện thoại) — để XEM và DẪN
 * ĐƯỜNG. Đây là thứ thay cho khung bản đồ trên web (ADR 0061 điều 1).
 *
 * Một LIÊN KẾT tới ứng dụng bản đồ người dùng đã có, không phải một API bản đồ: không key, không
 * tính tiền, không nằm trong phạm vi Google Maps Platform (thứ không dùng được ở Việt Nam). Dạng
 * `maps/search/?api=1` là dạng Google cam kết giữ ổn định cho liên kết từ bên ngoài.
 *
 * Ghép chuỗi tay thay vì `URL.searchParams`: package này chạy cả trên Metro, nơi `URLSearchParams`
 * của React Native không đủ đầy.
 */
export function mapExternalUrl(point: GeoPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.lat},${point.lng}`)}`;
}
