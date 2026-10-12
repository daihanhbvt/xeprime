'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { applyFilterPatch, parseFilters } from '../filter-params';
import type { MarketplaceFilters } from '../types';

/**
 * Filter marketplace nằm ở URL searchParams — ADR 0004.
 *
 * Nhờ vậy link chia sẻ được, nút back hoạt động, F5 không mất filter. Component không tự
 * parse query string; đọc/ghi qua hook này. Logic parse/serialize (CSV cho multi-select,
 * `1` cho boolean) nằm ở `filter-params.ts` — thuần hàm, unit-test được.
 *
 * ## Ghi: `history.replaceState`, dựng từ URL HIỆN TẠI của trình duyệt
 *
 * Không dựng từ `searchParams` của lần render trước và không qua `router.replace`: router chỉ
 * cập nhật `searchParams` khi lượt điều hướng xong (sau một vòng server), nên hai lần ghi liền
 * nhau — gõ từ khoá rồi bấm chip trước khi URL kịp đổi — cùng dựng từ bản CŨ và lần sau xoá
 * mất lần trước. `replaceState` đồng bộ ngay, nên mọi lần ghi cộng dồn lên nhau. Next đồng bộ
 * `useSearchParams` theo nó (cùng cách khối "Xe khả dụng" ở trang chủ đã ghi, `search-context`),
 * và không trang nào ở đây đọc searchParams phía server — không có gì để render lại.
 */
export function useMarketplaceFilters() {
  const searchParams = useSearchParams();

  const filters = useMemo<MarketplaceFilters>(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const setFilters = useCallback((patch: Partial<MarketplaceFilters>) => {
    const { pathname, search } = window.location;
    const params = new URLSearchParams(search);
    applyFilterPatch(params, patch);
    const qs = params.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    if (`${pathname}${search}` !== next) window.history.replaceState(null, '', next);
  }, []);

  return { filters, setFilters };
}
