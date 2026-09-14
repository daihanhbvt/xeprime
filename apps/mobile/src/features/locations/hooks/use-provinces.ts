import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE_TIME } from '@xeprime/api-client';
import { provinceSelectLabel } from '@xeprime/domain';
import type { SelectControlOption } from '@/components/ui/SelectControl';
import { queryKeys } from '@/queries/query-keys';
import { locationsApi } from '../api';

/**
 * Danh mục tỉnh/thành cho FORM NHẬP LIỆU — đăng ký gian hàng, hồ sơ gian hàng, chi nhánh.
 *
 * Nguồn là `GET /provinces`, không hardcode: danh mục hành chính đổi bằng quyết định của nhà
 * nước, và khi nó đổi thì chỉ migration + bảng `provinces` phải đổi.
 *
 * Khác `useDestinations` của marketplace: ở đó là "tỉnh đang có xe để khách tìm", ở đây là "tỉnh
 * được phép chọn khi khai báo địa điểm".
 *
 * Nhánh khoá `locations` nằm trong danh sách CÔNG KHAI của `resetSessionScopedCache` — đăng
 * nhập/đăng xuất không vứt nó đi, và đúng như vậy: danh mục hành chính không thuộc về ai.
 */
export function useProvinces() {
  return useQuery({
    queryKey: queryKeys.locations.provinces(),
    queryFn: () => locationsApi.provinces(),
    staleTime: STALE_TIME.REFERENCE,
  });
}

export interface ProvinceOptions {
  options: readonly SelectControlOption[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * Options cho `SelectField`: giá trị là MÃ, nhãn là tên KÈM TIỀN TỐ LOẠI ("TP Hà Nội").
 *
 * Mã ≠ chữ (ADR 0012): chỉ NHÃN mang tiền tố, giá trị đi trên dây vẫn là mã hai chữ số. Thứ tự
 * do server quyết định — client không sắp lại.
 */
export function useProvinceOptions(): ProvinceOptions {
  const query = useProvinces();
  const options = useMemo<readonly SelectControlOption[]>(
    () =>
      (query.data ?? []).map((province) => ({
        value: province.code,
        label: provinceSelectLabel(province.name, province.administrativeType),
      })),
    [query.data],
  );

  return {
    options,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
