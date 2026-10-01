'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchVehicles, filtersToParams } from '../api';
import type { VehicleFilters } from '../types';

/**
 * Danh sách xe của gian hàng — server data (TanStack Query, ADR 0004). Luôn phân trang server-side.
 * `keepPreviousData` giữ trang cũ trong lúc tải trang mới để bảng không nhấp nháy về rỗng.
 *
 * `filters.branchId` đến từ ô "Chi nhánh" của trang, tức từ URL (ADR 0052) — hook không tự đi
 * đọc một lựa chọn toàn cục nào. Nhờ vậy một màn muốn KHÔNG lọc chi nhánh (bộ chọn xe khi tạo
 * đơn, dải chào mừng ở trang Cửa hàng) chỉ cần không truyền, thay vì phải tìm cách thoát khỏi
 * một bộ lọc nó không đặt ra.
 */
export function useVehicles(filters: VehicleFilters, options: { enabled?: boolean } = {}) {
  const params = filtersToParams(filters);
  return useQuery({
    queryKey: queryKeys.vehicles.list(params),
    queryFn: () => fetchVehicles(filters),
    placeholderData: keepPreviousData,
    // Mặc định BẬT — hơn mười màn gọi hook này chỉ khi chúng đã được dựng. `enabled` là cho
    // những chỗ hỏi "có xe nào chưa" một cách có điều kiện (dải chào mừng ở trang Cửa hàng).
    enabled: options.enabled ?? true,
  });
}
