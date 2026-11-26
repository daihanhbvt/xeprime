import { useCallback, useRef } from 'react';

/**
 * Hàm "tải trang kế" cho danh sách CUỘN VÔ HẠN trên endpoint phân trang `page`/`limit` (luật
 * `mobile-feature` §5, 26/11/2026). Đi cùng `useAccumulatedPages` (gộp trang) và mốc gần đáy
 * (`onEndReached` của list, hoặc `Screen onNearEnd`). Không gọi khi đang tải hay đã hết trang.
 */
export function useLoadNextPage({
  page,
  limit,
  total,
  fetching,
  onPage,
}: {
  /** Trang của DỮ LIỆU đang có (`meta.page`), không phải state - tránh nhảy hai trang một lúc. */
  page: number | undefined;
  limit: number | undefined;
  total: number | undefined;
  fetching: boolean;
  onPage: (next: number) => void;
}): { hasNext: boolean; loadNext: () => void } {
  const hasNext = page != null && limit != null && total != null && page * limit < total;
  const state = useRef({ hasNext, fetching, page, onPage });
  state.current = { hasNext, fetching, page, onPage };
  const loadNext = useCallback(() => {
    const cur = state.current;
    if (!cur.hasNext || cur.fetching || cur.page == null) return;
    cur.onPage(cur.page + 1);
  }, []);
  return { hasNext, loadNext };
}
