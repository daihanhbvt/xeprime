'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { queryKeys } from '@/services/query-keys';
import {
  boardFiltersToParams,
  fetchMaintenanceBoard,
  fetchMaintenanceBoardSummary,
  fetchMaintenanceProfile,
  fetchMaintenanceRecords,
  fetchOdometerHistory,
} from './api';
import type { MaintenanceBoardFilters } from './types';

/** KM + chu kỳ + mốc suy ra của một xe. `enabled` tắt khi thiếu `vehicles.maintenance.view`. */
export function useMaintenanceProfile(vehicleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.maintenanceProfile(vehicleId ?? ''),
    queryFn: () => fetchMaintenanceProfile(vehicleId!),
    enabled: Boolean(vehicleId) && enabled,
    retry: false, // 403/404 là câu trả lời, không phải lỗi tạm
  });
}

export function useMaintenanceRecords(vehicleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.maintenanceRecords(vehicleId ?? ''),
    queryFn: () => fetchMaintenanceRecords(vehicleId!),
    enabled: Boolean(vehicleId) && enabled,
    retry: false,
  });
}

/** Lịch sử KM — chỉ tải khi mở panel lịch sử, phân trang server-side. */
export function useOdometerHistory(vehicleId: string, page: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.odometerHistory(vehicleId, page),
    queryFn: () => fetchOdometerHistory(vehicleId, page),
    enabled: Boolean(vehicleId) && enabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/**
 * Invalidate cả nhánh bảo dưỡng của một xe + bảng toàn đội xe sau mọi mutation.
 *
 * Wave 8 mở rộng thêm nhánh `vehicles`: hoàn tất bảo dưỡng làm KM và cảnh báo đổi, mà hai thứ
 * đó hiện trên thẻ xe ở danh sách, Hồ sơ 360 và lịch xe. Bỏ sót nhánh nào là để lại một màn
 * hình nói chuyện cũ cho tới lần tải trang sau.
 */
export function useInvalidateMaintenance(vehicleId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.maintenance(vehicleId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.maintenance.all });
    // Nhánh gốc gồm danh sách + stats + alerts của mọi xe đang hiển thị.
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.summary(vehicleId) });
    // Hoàn tất/hủy lịch bảo dưỡng nhả chỗ trên `vehicle_occupancies` (ADR 0006).
    void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
  };
}

// ── Trung tâm bảo dưỡng ─────────────────────────────────────────────────────

/** Bộ lọc ở URL searchParams (ADR 0004) — view lọc phải chia sẻ và reload được. */
export function useMaintenanceBoardFilters() {
  return useUrlFilters<MaintenanceBoardFilters>((sp) => ({
    filter: sp.get('filter') ?? 'all',
    q: sp.get('q') ?? undefined,
    type: sp.get('type') ?? 'all',
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    sort: sp.get('sort') ?? 'remaining_asc',
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  }));
}

export function useMaintenanceBoard(filters: MaintenanceBoardFilters, enabled = true) {
  const params = boardFiltersToParams(filters);
  return useQuery({
    queryKey: queryKeys.maintenance.board(params),
    queryFn: () => fetchMaintenanceBoard(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Đếm theo nhóm việc — độc lập với trang/bộ lọc hiện tại nên có query key riêng. */
export function useMaintenanceBoardSummary(enabled = true) {
  return useQuery({
    queryKey: queryKeys.maintenance.summary(),
    queryFn: fetchMaintenanceBoardSummary,
    enabled,
  });
}
