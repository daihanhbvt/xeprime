'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  CUSTOMER_TRIP_FILTER_DEFAULT,
  isCustomerTripFilter,
  type CustomerTripFilter,
} from '@xeprime/types';

/**
 * Tab + trang của một danh sách chuyến, sống trên URL (ADR 0004) — tab đang mở gửi link được, F5
 * không mất, nút Back quay đúng tab trước đó.
 *
 * Dùng chung cho HAI danh sách: chuyến đi thuê của khách (`/trips` site khách) và chuyến cho thuê
 * của chủ xe tuyến hoa hồng (`/trips` site partner). `basePath` là KHU chứa danh sách — hai site,
 * hai gốc đường dẫn, cùng một phép ghi.
 */
export function useTripListUrl(basePath: string) {
  const router = useRouter();
  const params = useSearchParams();

  const rawFilter = params?.get('filter');
  const filter: CustomerTripFilter = isCustomerTripFilter(rawFilter)
    ? rawFilter
    : CUSTOMER_TRIP_FILTER_DEFAULT;
  const page = Math.max(1, Number(params?.get('page') ?? 1) || 1);

  /** Ghi tab/trang lên URL — dựng lại từ query hiện tại để tham số khác (`ref`, `utm_*`) sống sót. */
  function navigate(next: { filter?: CustomerTripFilter; page?: number }) {
    const search = new URLSearchParams(params?.toString() ?? '');
    // `?role=` của bản hai phía cũ (trước ADR 0053) không còn nghĩa: mỗi danh sách đã khoá vai.
    search.delete('role');
    const nextFilter = next.filter ?? filter;
    // Đổi tab luôn về trang 1: giữ `page=4` khi sang tab chỉ có 1 trang là một trang trống.
    const nextPage = next.page ?? (next.filter !== undefined ? 1 : page);

    // Tab mặc định không cần tham số: đường dẫn trần đã là `Chuyến hiện tại`.
    if (nextFilter === CUSTOMER_TRIP_FILTER_DEFAULT) search.delete('filter');
    else search.set('filter', nextFilter);
    if (nextPage <= 1) search.delete('page');
    else search.set('page', String(nextPage));

    const qs = search.toString();
    router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  }

  return { filter, page, navigate };
}
