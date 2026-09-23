'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BOOKING_REQUEST_TAB_NEEDS_ACTION } from '../constants';
import type { BookingRequestFilters } from '../types';

/**
 * Filter inbox ở URL searchParams (ADR 0004). Mặc định lọc tab GỘP "Cần xử lý" — inbox mở ra
 * là thấy ngay việc cần xử lý, kể cả yêu cầu đã cọc (`BOOKING_REQUEST_TAB_NEEDS_ACTION`).
 *
 * Ba tab (ADR 0047) phủ hết 11 trạng thái nên không còn tab "Tất cả" — `useUrlFilters` dùng
 * chung vẫn không hợp ở đây vì tab vẫn cần một giá trị mặc định KHÁC "xoá tham số" (mở hộp thư
 * ra là "Cần xử lý", không phải rỗng).
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
      status: searchParams.get('status') ?? BOOKING_REQUEST_TAB_NEEDS_ACTION,
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
  const activeTab = filters.status ?? BOOKING_REQUEST_TAB_NEEDS_ACTION;

  /** Đổi tab → về trang 1 (không truyền `page` nên tham số bị xoá, tức trang 1). */
  const selectTab = useCallback(
    (value: string) => setFilters({ status: value }),
    [setFilters],
  );

  return { filters, setFilters, activeTab, selectTab, hasFilters, clearFilters };
}
