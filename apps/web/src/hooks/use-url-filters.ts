'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Filter/paging của một danh sách sống ở URL searchParams (ADR 0004) — view lọc phải chia sẻ
 * được, sống sót qua reload và phản ứng với nút Back.
 *
 * Mỗi feature chỉ còn phải viết hàm `parse` của riêng nó; phần ghi ngược lên URL giống hệt nhau
 * ở mọi danh sách nên nằm ở đây:
 *  - giá trị rỗng / `'all'` / `false` → XOÁ tham số, không ghi `?status=all` vào URL;
 *  - đổi bất cứ filter nào (trừ khi tự set `page`) → về trang 1, vì trang 7 của kết quả cũ
 *    không có nghĩa với kết quả mới;
 *  - `router.replace` + `scroll: false` — lọc lại không tạo thêm mục lịch sử và không nhảy trang.
 *
 * Các feature cũ vẫn giữ bản copy của riêng chúng — dời dần sang đây khi chạm vào.
 */
export function useUrlFilters<TFilters extends object>(
  parse: (searchParams: URLSearchParams) => TFilters,
): { filters: TFilters; setFilters: (patch: Partial<TFilters>) => void } {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // `parse` thường là arrow inline nên đổi identity mỗi render — cố tình chỉ phụ thuộc
  // searchParams, nếu không `filters` là object mới mỗi lần và mọi query key đều đổi theo.
  const filters = useMemo(
    () => parse(new URLSearchParams(searchParams.toString())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams],
  );

  const setFilters = useCallback(
    (patch: Partial<TFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (
          value === undefined ||
          value === null ||
          value === '' ||
          value === 'all' ||
          value === false
        ) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }
      if (!('page' in patch)) params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { filters, setFilters };
}

/** Đọc một tham số số nguyên dương từ URL (page/limit); giá trị rác → undefined. */
export function positiveIntParam(
  searchParams: URLSearchParams,
  key: string,
): number | undefined {
  const value = Number(searchParams.get(key));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
