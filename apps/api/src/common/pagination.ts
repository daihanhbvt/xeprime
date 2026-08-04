import type { PaginationMeta } from '@xeprime/types';

/**
 * Phân trang cho list endpoint — CLAUDE.md §9 (`page`, `limit`, `total`, `hasNext`).
 *
 * Hai việc nhỏ nhưng phải đúng ở MỌI endpoint: kẹp `limit` theo trần của endpoint (client
 * không được tự nâng thành `limit=100000` để kéo cả bảng) và tính `hasNext` cùng một cách.
 * Viết lại từng service là cách để một chỗ nào đó quên kẹp trần.
 *
 * Các module cũ (finance, bookings, vehicles…) vẫn tự tính tại chỗ — dời dần sang đây khi
 * chạm vào, đừng sửa hàng loạt trong một diff không liên quan.
 */
export interface PagingQuery {
  page?: number;
  limit?: number;
}

export interface ResolvedPaging {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export function resolvePaging(
  query: PagingQuery,
  defaultLimit: number,
  maxLimit: number,
): ResolvedPaging {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(maxLimit, Math.max(1, query.limit ?? defaultLimit));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function paginationMeta(paging: ResolvedPaging, total: number): PaginationMeta {
  const { page, limit } = paging;
  return { page, limit, total, hasNext: page * limit < total };
}
