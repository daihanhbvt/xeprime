'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { SelectFieldOption } from '@/components/form/SelectField';
import { apiRequest } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { Province } from '../types';

/**
 * Danh mục tỉnh/thành cho các FORM NHẬP LIỆU (đăng ký gian hàng, tạo/sửa chi nhánh).
 *
 * Nguồn là database qua `GET /provinces` — frontend KHÔNG hardcode 34 tỉnh. Danh mục hành chính
 * đổi bằng quyết định của nhà nước, và khi nó đổi thì chỉ có migration + bảng `provinces` phải
 * đổi, không phải đi sửa một mảng nằm trong React.
 *
 * Khác `useDestinations` của marketplace: ở đó là "tỉnh đang có xe để khách tìm", ở đây là
 * "tỉnh được phép chọn khi khai báo địa điểm" — hai câu hỏi khác nhau, hai endpoint khác nhau.
 */
export function useProvinces() {
  return useQuery({
    queryKey: queryKeys.locations.provinces(),
    queryFn: async (): Promise<Province[]> => {
      const res = await apiRequest<{ items: Province[] }>('/provinces');
      return res.data.items;
    },
    // Danh mục hành chính gần như bất động — không cần hỏi lại liên tục trong một phiên.
    staleTime: 30 * 60_000,
  });
}

/** Options cho `SelectField`: giá trị là MÃ, nhãn là tên chuẩn tiếng Việt. */
export function useProvinceOptions(): {
  options: SelectFieldOption[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
} {
  const query = useProvinces();
  const options = useMemo(
    () => (query.data ?? []).map((p) => ({ value: p.code, label: p.name })),
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
