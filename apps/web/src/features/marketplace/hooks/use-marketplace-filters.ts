'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
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
 * cập nhật `searchParams` khi lượt điều hướng xong, nên hai lần ghi liền nhau — gõ từ khoá rồi
 * bấm chip trước khi URL kịp đổi — cùng dựng từ bản CŨ và lần sau xoá mất lần trước.
 * `replaceState` đồng bộ ngay, nên mọi lần ghi cộng dồn lên nhau.
 *
 * ## Đọc: external store trên `window.location.search`
 *
 * Next đồng bộ `useSearchParams` theo `replaceState`, nhưng trong một transition — tức trễ một
 * nhịp so với cú bấm. Store dưới đây báo cho MỌI component đang đọc bộ lọc ngay trong lượt ghi,
 * nên chip, thanh tìm kiếm và danh sách đổi cùng một khung hình.
 *
 * ⚠️ Hợp đồng của store: **mọi lần ghi URL bộ lọc phải đi qua `setFilters`**. Một `replaceState`
 * gọi thẳng ở chỗ khác đổi `window.location` mà không báo store; lần render kế tiếp (do một cú
 * bấm KHÁC) mới thấy URL mới và các khối đồng bộ "URL → nháp" coi đó là "URL bị người khác
 * đổi" — nạp đè đúng lựa chọn khách vừa bấm.
 */

const listeners = new Set<() => void>();
function notifyFilterChange() {
  for (const fn of listeners) fn();
}

function subscribeFilterChange(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener('popstate', callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('popstate', callback);
  };
}

function getSearchStringSnapshot(): string {
  return window.location.search;
}

/**
 * `null` = "chưa có trình duyệt để đọc" (SSR và lượt hydrate) ⇒ dùng `useSearchParams`. Không
 * dùng `''` làm tín hiệu đó: chuỗi rỗng là một URL CÓ THẬT (khách vừa xoá hết bộ lọc), và đọc nó
 * thành "chưa hydrate" sẽ trả lại bộ lọc cũ của router.
 */
function getServerSearchStringSnapshot(): string | null {
  return null;
}

export function useMarketplaceFilters() {
  const searchParams = useSearchParams();
  const clientSearch = useSyncExternalStore<string | null>(
    subscribeFilterChange,
    getSearchStringSnapshot,
    getServerSearchStringSnapshot,
  );
  const searchString = clientSearch ?? searchParams.toString();

  const filters = useMemo<MarketplaceFilters>(
    () => parseFilters(new URLSearchParams(searchString)),
    [searchString],
  );

  const setFilters = useCallback((patch: Partial<MarketplaceFilters>) => {
    const { pathname, search } = window.location;
    const params = new URLSearchParams(search);
    applyFilterPatch(params, patch);
    const qs = params.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    if (`${pathname}${search}` !== next) {
      window.history.replaceState(null, '', next);
      notifyFilterChange();
    }
  }, []);

  return { filters, setFilters };
}
