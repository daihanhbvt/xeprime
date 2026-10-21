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
 * `replaceState` cập nhật URL tức thì và notify các component dùng `useSyncExternalStore`
 * để re-render ngay trong cùng frame, không bị trễ qua roundtrip router.
 */

const listeners = new Set<() => void>();
function notifyFilterChange() {
  for (const fn of listeners) fn();
}

function subscribeFilterChange(callback: () => void): () => void {
  listeners.add(callback);
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', callback);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', callback);
    }
  };
}

function getSearchStringSnapshot(): string {
  return typeof window !== 'undefined' ? window.location.search : '';
}

function getServerSearchStringSnapshot(): string {
  return '';
}

export function useMarketplaceFilters() {
  const searchParams = useSearchParams();
  const clientSearch = useSyncExternalStore(
    subscribeFilterChange,
    getSearchStringSnapshot,
    getServerSearchStringSnapshot,
  );

  // Khi ở client đã hydrate, ưu tiên đọc window.location.search được cập nhật liên tục bởi replaceState
  const searchString = typeof window !== 'undefined' && clientSearch !== '' ? clientSearch : searchParams.toString();

  const filters = useMemo<MarketplaceFilters>(
    () => parseFilters(new URLSearchParams(searchString.startsWith('?') ? searchString.slice(1) : searchString)),
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

