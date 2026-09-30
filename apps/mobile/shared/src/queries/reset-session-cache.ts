import type { QueryClient, QueryKey } from '@tanstack/react-query';

const PUBLIC_QUERY_ROOTS: ReadonlySet<string> = new Set([
  'banners',
  'catalog',
  'marketplace',
  'locations',
]);

function isPublicQuery(queryKey: QueryKey): boolean {
  return typeof queryKey[0] === 'string' && PUBLIC_QUERY_ROOTS.has(queryKey[0]);
}

/**
 * Xoá dữ liệu gắn với PHIÊN. Gọi khi đăng nhập, đăng xuất và khi phiên hết hạn.
 *
 * `resetQueries()` chứ KHÔNG `clear()`: `clear()` gỡ query khỏi cache nhưng observer đang
 * mounted giữ nguyên kết quả cũ và không fetch lại — màn hình vẫn hiện dữ liệu của phiên đã chết.
 *
 * Có `predicate` chứ không quét sạch: reset mọi thứ nghĩa là đăng nhập xong banner, danh mục và
 * danh sách xe ngoài trang chủ đều bị vứt rồi tải lại, dù không dữ liệu nào trong đó đổi.
 */
export function resetSessionScopedCache(queryClient: QueryClient): void {
  void queryClient.resetQueries({ predicate: (query) => !isPublicQuery(query.queryKey) });
}
