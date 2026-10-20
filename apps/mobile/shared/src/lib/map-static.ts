import type { GeoPoint } from '@xeprime/domain';
import { getApiBaseUrl } from './api-client';

/**
 * Ảnh bản đồ TĨNH do API vẽ hộ (Vietmap — ADR 0061 điều 1) — bản native của `api-href.ts` +
 * `placeMapSrc` / `pickupMapSrc` / `branchMapSrc` bên web.
 *
 * App không còn khoá bản đồ nào trong bundle và không còn bản đồ tương tác: mọi tấm bản đồ là một
 * ảnh PNG từ endpoint của API, nơi services key nằm và nơi ảnh được cache theo điểm. Ai cần chỉ
 * đường thì mở ứng dụng bản đồ của máy (`mapExternalUrl` của `@xeprime/domain`).
 *
 * Ba endpoint, ba mức cổng:
 * - `/places/map?placeId=` — công khai; chỉ vẽ cho mã đã qua `/places/detail`.
 * - `/public/listings/:id/pickup-map` — công khai; toạ độ server tự đọc từ chi nhánh của xe.
 * - `/branches/:id/map` — CẦN phiên (quyền xem chi nhánh) ⇒ nơi gọi gửi kèm header Bearer
 *   (`useAuthImageHeaders`).
 */

/** Tỉ lệ ảnh API trả (2:1 cố định) — khung hiển thị giữ đúng tỉ lệ này. */
export const MAP_PREVIEW_RATIO = 2;

function apiHref(path: string): string {
  return `${getApiBaseUrl()}${path}`;
}

/**
 * URL kèm `v` = toạ độ + dòng địa chỉ in trên ảnh. Ảnh được cache THEO URL (đĩa của `expo-image`,
 * một ngày ở HTTP cache), nên mọi thứ làm đổi tấm ảnh phải đổi URL. Server bỏ qua `v`. Khớp web.
 */
function versionedMapHref(path: string, point: GeoPoint, label: string): string {
  const v = encodeURIComponent(`${point.lat},${point.lng},${label.trim()}`);
  return apiHref(`${path}?v=${v}`);
}

/** Ảnh bản đồ của một địa điểm VỪA CHỌN từ gợi ý — mã là danh tính của điểm, không cần `v`. */
export function placeMapUri(placeId: string): string {
  return apiHref(`/places/map?placeId=${encodeURIComponent(placeId)}`);
}

/** Ảnh điểm nhận xe trên trang xe (công khai). */
export function pickupMapUri(listingId: string, point: GeoPoint, address: string): string {
  return versionedMapHref(`/public/listings/${encodeURIComponent(listingId)}/pickup-map`, point, address);
}

/** Ảnh vị trí một chi nhánh của gian hàng — CẦN header Bearer. */
export function branchMapUri(branchId: string, point: GeoPoint, address: string): string {
  return versionedMapHref(`/branches/${encodeURIComponent(branchId)}/map`, point, address);
}
