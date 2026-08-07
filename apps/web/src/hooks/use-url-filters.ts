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
 *
 * **Cố ý KHÔNG hỗ trợ tham số dạng mảng / lặp.** Marketplace mã hoá mảng bằng CSV (`sedan,suv`)
 * và boolean bằng `1`; quy ước đó nằm ở [filter-params.ts](../features/marketplace/filter-params.ts),
 * có test riêng, và **không danh sách quản lý nào dùng**. Kéo nó lên đây sẽ bẻ hợp đồng chung
 * theo nhu cầu của một consumer duy nhất có ngữ nghĩa khác hẳn (facet vs lọc bảng).
 *
 * **`use-calendar-filters` nằm ngoài phạm vi gom, vĩnh viễn** — không phải vì chưa tới lượt:
 * lịch **không phân trang**, nên luật trung tâm của hook này ("đổi filter → về trang 1") vô nghĩa
 * ở đó, và ép vào sẽ thêm một nhánh điều kiện chỉ phục vụ một nơi. Xem
 * [04 D2](../../../../docs/implementation/04_COMPONENT_DUPLICATES.md).
 */
export interface SetFiltersOptions {
  /**
   * Ép giữ nguyên trang. Dùng cho tham số **chỉ ảnh hưởng giao diện**, không đổi tập dữ liệu —
   * ví dụ `view=grid|list`, `tab=…`, mở/đóng một panel. Đưa người dùng về trang 1 vì đổi kiểu
   * hiển thị là mất chỗ đang đọc mà không có lý do.
   *
   * Mặc định (`undefined`) giữ nguyên luật cũ: đổi filter → về trang 1.
   */
  resetPage?: boolean;
}

export function useUrlFilters<TFilters extends object>(
  parse: (searchParams: URLSearchParams) => TFilters,
): {
  filters: TFilters;
  setFilters: (patch: Partial<TFilters>, options?: SetFiltersOptions) => void;
} {
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
    (patch: Partial<TFilters>, options?: SetFiltersOptions) => {
      // Bắt đầu từ searchParams HIỆN CÓ, không dựng mới: mọi tham số không liên quan
      // (`ref`, `utm_*`, tham số của feature khác trên cùng route) phải sống sót qua mỗi lần lọc.
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

      // Tự set `page` → tôn trọng, đó chính là hành động phân trang.
      // `resetPage: false` → tham số chỉ đổi giao diện, giữ nguyên trang.
      const shouldResetPage = 'page' in patch ? false : (options?.resetPage ?? true);
      if (shouldResetPage) params.delete('page');

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { filters, setFilters };
}

/** Đọc một tham số số nguyên dương từ URL (page/limit); giá trị rác → undefined. */
export function positiveIntParam(searchParams: URLSearchParams, key: string): number | undefined {
  const value = Number(searchParams.get(key));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
