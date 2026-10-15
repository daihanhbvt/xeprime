import type { GeoPoint } from '@xeprime/domain';

/**
 * Gốc API của TRÌNH DUYỆT: `/api` cùng origin — một image chạy được trên mọi host, mọi request mang
 * cookie host-only của đúng site, không còn CORS cho web. Máy dev: `proxy.ts` chuyển `/api/*` sang
 * API local và gắn realm theo khu của trang (đọc từ Referer — nên cả thẻ `<img>` cũng đúng realm).
 *
 * Tách khỏi `services/api-client.ts` để Server Component dựng được URL cho thẻ `<img>` mà không kéo
 * theo cấu hình transport của client.
 */
export const BROWSER_API_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || '/api';

/** URL tới API cho thứ TRÌNH DUYỆT tự tải (thẻ `<img>`, link tải file) — cùng gốc với mọi request web. */
export function browserApiHref(path: string): string {
  return `${BROWSER_API_URL}${path}`;
}

/**
 * URL ảnh bản đồ tĩnh (ADR 0061 điều 1) kèm `v` = toạ độ + dòng địa chỉ in trên ảnh. Trình duyệt
 * giữ ảnh một ngày THEO URL, nên mọi thứ làm đổi tấm ảnh — dời ghim, sửa dòng địa chỉ — phải đổi
 * URL; không thì khách thấy ảnh cũ tới hết ngày. Server bỏ qua `v`.
 */
export function staticMapHref(path: string, point: GeoPoint, label: string): string {
  const query = new URLSearchParams({ v: `${point.lat},${point.lng},${label.trim()}` });
  return browserApiHref(`${path}?${query.toString()}`);
}
