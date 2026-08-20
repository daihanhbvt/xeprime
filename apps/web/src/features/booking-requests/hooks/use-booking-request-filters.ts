'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BOOKING_REQUEST_STATUS } from '@xeprime/types';
import { BOOKING_REQUEST_STATUS_ALL } from '../constants';
import type { BookingRequestFilters } from '../types';

/**
 * Filter inbox ở URL searchParams (ADR 0004). Mặc định lọc `pending_host_approval` — inbox
 * mở ra là thấy ngay việc cần xử lý.
 *
 * "Tất cả" là `?status=all`, KHÔNG phải "xoá tham số".
 *
 * Trước đây chọn "Tất cả trạng thái" xoá tham số đi, rồi chính hook này lại đọc thiếu tham số
 * là `pending_host_approval` — hai luật đúng riêng lẻ nhưng triệt tiêu nhau, nên tab "Tất cả"
 * bật xong lập tức nhảy về "Cần xử lý". Vì thế `all` phải là một giá trị THẬT trong URL, và
 * `useUrlFilters` dùng chung không dùng được ở đây (nó xoá mọi giá trị `'all'` theo thiết kế).
 */
export function useBookingRequestFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<BookingRequestFilters>(() => {
    const numberParam = (key: string): number | undefined => {
      const raw = searchParams.get(key);
      if (!raw) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    return {
      status: searchParams.get('status') ?? BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      q: searchParams.get('q') ?? undefined,
      serviceType: searchParams.get('serviceType') ?? undefined,
      vehicleId: searchParams.get('vehicleId') ?? undefined,
      page: numberParam('page'),
      limit: numberParam('limit'),
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<BookingRequestFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        // `all` đi VÀO url như mọi giá trị khác; chỉ giá trị rỗng thật mới xoá tham số.
        if (value === undefined || value === null || value === '') params.delete(key);
        else params.set(key, String(value));
      }
      // Đổi bất cứ filter nào (trừ chính hành động phân trang) → về trang 1: trang 7 của kết
      // quả cũ không có nghĩa với kết quả mới.
      if (!('page' in patch)) params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  /**
   * Có filter nào (ngoài TAB) đang bật không.
   *
   * Trạng thái cố ý không tính: nó luôn có giá trị — mở hộp thư ra đã là "Cần xử lý" — nên đếm
   * nó vào thì hộp thư trống lúc nào cũng đổ tại bộ lọc.
   */
  const hasFilters = Boolean(filters.q) || Boolean(filters.serviceType);

  /** Xoá mọi filter ngoài tab. Mọi khoá phải có mặt, nếu không `setFilters` không đụng tới. */
  const clearFilters = useCallback(
    () => setFilters({ q: undefined, serviceType: undefined }),
    [setFilters],
  );

  /** Tab đang mở — dùng cho `<Tabs activeKey>`; thiếu tham số vẫn là "Cần xử lý". */
  const activeTab = filters.status ?? BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;

  /** Đổi tab → về trang 1 (không truyền `page` nên tham số bị xoá, tức trang 1). */
  const selectTab = useCallback(
    (value: string) => setFilters({ status: value || BOOKING_REQUEST_STATUS_ALL }),
    [setFilters],
  );

  return { filters, setFilters, activeTab, selectTab, hasFilters, clearFilters };
}
