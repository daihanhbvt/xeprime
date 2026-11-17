import { useRef } from 'react';

/**
 * Gộp các trang của một danh sách phân trang ở server thành MỘT mảng cho cuộn vô hạn (mobile,
 * người dùng 16/11/2026). Trang 1 thay toàn bộ (đổi bộ lọc / kéo làm mới); trang sau nối thêm,
 * bỏ trùng theo khoá. Đọc số trang từ `meta.page` của DỮ LIỆU (không từ state) để bản giữ chỗ
 * `keepPageData` không bị nối nhầm.
 */
export function useAccumulatedPages<T>(
  items: readonly T[] | undefined,
  page: number | undefined,
  keyOf: (row: T) => string = (row) => (row as { id: string }).id,
): readonly T[] {
  const acc = useRef<{ page: number; rows: readonly T[]; source: readonly T[] | undefined }>({
    page: 0,
    rows: [],
    source: undefined,
  });
  const cur = acc.current;
  if (items && page !== undefined && items !== cur.source) {
    if (page === cur.page && page > 1) {
      // Làm mới đúng trang đang cuối (sau một thao tác) - giữ các trang đã gộp.
      acc.current = { ...cur, source: items };
    } else if (page <= 1 || page < cur.page) {
      acc.current = { page, rows: items, source: items };
    } else {
      const seen = new Set(cur.rows.map(keyOf));
      acc.current = {
        page,
        rows: [...cur.rows, ...items.filter((row) => !seen.has(keyOf(row)))],
        source: items,
      };
    }
  }
  return acc.current.rows;
}
