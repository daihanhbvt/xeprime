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
