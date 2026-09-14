'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { provinceSelectLabel } from '@xeprime/domain';
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

/**
 * Options cho `SelectField`: giá trị là MÃ, nhãn là tên KÈM TIỀN TỐ LOẠI ("TP Hà Nội").
 *
 * Tiền tố chỉ có ở đây, không có trong chuỗi địa chỉ đã lưu: danh sách trộn 6 thành phố với 28
 * tỉnh, và tiền tố là thứ duy nhất cho biết "Huế" là thành phố trực thuộc trung ương.
 *
 * Thứ tự do SERVER quyết định (`provinces.sort_order`: sáu thành phố lên đầu, rồi tỉnh theo
 * bảng chữ cái) — client KHÔNG sắp lại, nếu không admin đổi thứ tự ở màn danh mục sẽ vô nghĩa.
 */
export function useProvinceOptions(): {
  options: SelectFieldOption[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
} {
  const query = useProvinces();
  const options = useMemo(
    () =>
      (query.data ?? []).map((p) => ({
        value: p.code,
        label: provinceSelectLabel(p.name, p.administrativeType),
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
