'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { SelectFieldOption } from '@/components/form/SelectField';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { apiRequest } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { Ward, WardList } from '../types';

/**
 * Gõ bao nhiêu thì mới hỏi lại server.
 *
 * Một tỉnh có tối đa 168 đơn vị nên lần tải ĐẦU đã đủ cho cả tỉnh — ô tìm chỉ cần thiết khi
 * người dùng muốn nhảy nhanh. 250ms là ngưỡng vừa đủ để không bắn một request cho mỗi phím mà
 * vẫn cảm giác như lọc tại chỗ.
 */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Xã/phường/đặc khu của MỘT tỉnh — cấp thứ hai của mô hình hành chính hai cấp (từ 01/07/2025).
 *
 * Nguồn là database qua `GET /provinces/:code/wards`; frontend KHÔNG hardcode 3.321 đơn vị, và
 * cũng không tải cả nước rồi lọc phía client — 3.321 dòng là ~300KB cho mỗi lần mở form, để
 * người dùng chỉ nhìn 168 dòng trong số đó.
 *
 * **Tìm kiếm chạy ở SERVER** vì nó tìm trên khoá đã bỏ dấu và bỏ tiền tố loại đơn vị: gõ
 * `"ba dinh"` phải ra `"Phường Ba Đình"`, mà phép chuẩn hoá đó nằm ở DB. Lọc bằng chuỗi con
 * phía client sẽ trượt đúng những lần gõ mà người dùng cần nó nhất.
 *
 * Chưa chọn tỉnh ⇒ query TẮT: không có câu hỏi nào để hỏi, và một request `/provinces//wards`
 * là một lỗi 404 trong tab Network mà không ai gây ra.
 */
export function useWards(provinceCode: string | null | undefined, search?: string) {
  const debouncedSearch = useDebouncedValue(search?.trim() ?? '', SEARCH_DEBOUNCE_MS);
  const code = provinceCode?.trim() || '';

  return useQuery({
    queryKey: queryKeys.locations.wards(code, debouncedSearch),
    queryFn: async (): Promise<WardList> => {
      const res = await apiRequest<WardList>(
        `/provinces/${encodeURIComponent(code)}/wards${
          debouncedSearch ? `?q=${encodeURIComponent(debouncedSearch)}` : ''
        }`,
      );
      return res.data;
    },
    enabled: code.length > 0,
    // Danh mục hành chính gần như bất động — cùng mốc với `useProvinces`.
    staleTime: 30 * 60_000,
    // Giữ kết quả cũ trong lúc gõ tiếp: danh sách nhấp nháy về rỗng giữa hai lần tìm khiến ô
    // chọn trông như vừa mất hết dữ liệu.
    placeholderData: (previous) => previous,
  });
}

/** Options cho `SelectField`: giá trị là MÃ 5 chữ số, nhãn là tên đầy đủ kèm tiền tố loại. */
export function useWardOptions(
  provinceCode: string | null | undefined,
  search?: string,
): {
  options: SelectFieldOption[];
  items: Ward[];
  /** Tổng số đơn vị của tỉnh (không theo ô tìm). */
  total: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const query = useWards(provinceCode, search);
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const options = useMemo(() => items.map((w) => ({ value: w.code, label: w.name })), [items]);

  return {
    options,
    items,
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

/**
 * Tra NHÃN của các mã xã ĐÃ LƯU.
 *
 * Khác `useWards`: đây không phải bộ chọn mà là màn hiển thị cầm trong tay vài cái mã và cần
 * tên. Tải cả 168 đơn vị của tỉnh chỉ để lấy một cái tên là lãng phí rõ ràng, nên có endpoint
 * riêng nhận danh sách mã.
 */
export function useWardLookup(codes: readonly string[]) {
  const unique = useMemo(
    () => [...new Set(codes.filter((c): c is string => Boolean(c)))].sort(),
    [codes],
  );

  return useQuery({
    queryKey: queryKeys.locations.wardLookup(unique),
    queryFn: async (): Promise<Map<string, Ward>> => {
      const res = await apiRequest<WardList>(
        `/wards/lookup?codes=${encodeURIComponent(unique.join(','))}`,
      );
      return new Map(res.data.items.map((w) => [w.code, w]));
    },
    enabled: unique.length > 0,
    staleTime: 30 * 60_000,
  });
}
