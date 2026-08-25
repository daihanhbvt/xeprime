/**
 * Hình học vị trí dùng chung — web, app native và backend nói cùng một thứ về khoảng cách.
 *
 * File này KHÔNG gọi mạng và không biết nhà cung cấp bản đồ nào tồn tại. Nó chỉ có ba việc:
 * đo đường chim bay, chuẩn hoá địa chỉ thành khoá cache, và làm tròn toạ độ. Phần gọi
 * Geocoding/Routes nằm ở `apps/api/src/modules/geo` vì nó cần API key — thứ không bao giờ được
 * có mặt trong package dùng chung (CLAUDE.md §5).
 */

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
