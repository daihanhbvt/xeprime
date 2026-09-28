import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE_TIME } from '@xeprime/api-client';
import type { SelectControlOption } from '@/components/ui/SelectControl';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { queryKeys } from '@/queries/query-keys';
import { locationsApi, type Ward } from '../api';

/**
 * Gõ bao nhiêu thì mới hỏi lại server.
 *
 * Một tỉnh có tối đa 168 đơn vị nên lần tải ĐẦU đã đủ cho cả tỉnh — ô tìm chỉ cần khi người dùng
 * muốn nhảy nhanh. 250ms vừa đủ để không bắn một request cho mỗi phím mà vẫn như lọc tại chỗ.
 */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Xã/phường/đặc khu của MỘT tỉnh — cấp thứ hai của mô hình hành chính hai cấp (từ 01/07/2025).
 *
 * Không tải cả nước rồi lọc trên máy: 3.321 dòng là ~300KB cho mỗi lần mở form, để người dùng
 * chỉ nhìn 168 dòng trong số đó. Chưa chọn tỉnh ⇒ query TẮT, không có câu hỏi nào để hỏi.
 *
 * Nhánh khoá `locations` nằm trong danh sách CÔNG KHAI của `resetSessionScopedCache` — đăng
 * nhập/đăng xuất không vứt nó đi, và đúng như vậy: danh mục hành chính không thuộc về ai.
 */
export function useWards(provinceCode: string | null | undefined, search?: string) {
  const debouncedSearch = useDebouncedValue(search?.trim() ?? '', SEARCH_DEBOUNCE_MS);
  const code = provinceCode?.trim() ?? '';

  return useQuery({
    queryKey: queryKeys.locations.wards(code, debouncedSearch),
    queryFn: () => locationsApi.wards(code, debouncedSearch),
    enabled: code.length > 0,
    staleTime: STALE_TIME.REFERENCE,
    // Giữ kết quả cũ trong lúc gõ tiếp: danh sách nhấp nháy về rỗng giữa hai lần tìm trông như
    // vừa mất hết dữ liệu.
    placeholderData: (previous) => previous,
  });
}

export interface WardOptions {
  options: readonly SelectControlOption[];
  items: readonly Ward[];
  /** Tổng số đơn vị của tỉnh (không theo ô tìm). */
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/** Options cho `SelectField`: giá trị là MÃ 5 chữ số, nhãn là tên đầy đủ kèm tiền tố loại. */
export function useWardOptions(
  provinceCode: string | null | undefined,
  search?: string,
): WardOptions {
  const query = useWards(provinceCode, search);
  const items = useMemo<readonly Ward[]>(() => query.data?.items ?? [], [query.data]);
  const options = useMemo<readonly SelectControlOption[]>(
    () => items.map((ward) => ({ value: ward.code, label: ward.name })),
    [items],
  );

  return {
    options,
    items,
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
