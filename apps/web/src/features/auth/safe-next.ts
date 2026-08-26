/**
 * Chống open redirect cho `?next=`.
 *
 * Luật kiểm nay sống ở `@xeprime/domain` (`safe-path.ts`) vì API cũng phải kiểm đúng tham số đó
 * ở `GET /auth/social/:provider` — ADR 0019. File này giữ lại phần chỉ web cần (dựng URL), và
 * re-export hai hàm kia để 30+ chỗ gọi không phải đổi import.
 */
export { isSafeNextPath, safeNextPath } from '@xeprime/domain';

import { isSafeNextPath } from '@xeprime/domain';

/** Ghép `?next=` vào một route, bỏ qua nếu `next` không an toàn. */
export function withNext(route: string, next: string | null | undefined): string {
  if (!isSafeNextPath(next)) return route;
  const separator = route.includes('?') ? '&' : '?';
  return `${route}${separator}next=${encodeURIComponent(next)}`;
}

/** Đường dẫn hiện tại (pathname + query) để làm `next` khi mở auth. */
export function currentPathWithQuery(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}
