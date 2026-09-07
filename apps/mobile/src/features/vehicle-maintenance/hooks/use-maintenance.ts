import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import {
  maintenanceApi,
  maintenanceBoardToParams,
  type CompleteMaintenanceInput,
  type CorrectOdometerInput,
  type MaintenanceBoardFilters,
  type SaveMaintenanceProfileInput,
  type SaveMaintenanceRecordInput,
} from '../api';

/** KM + chu kỳ + mốc suy ra của một xe. `enabled` tắt khi thiếu `vehicles.maintenance.view`. */
export function useMaintenanceProfile(vehicleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.maintenanceProfile(vehicleId ?? ''),
    queryFn: () => maintenanceApi.profile(vehicleId as string),
    enabled: Boolean(vehicleId) && enabled,
    // 403/404 là CÂU TRẢ LỜI, không phải lỗi tạm để thử lại.
    retry: false,
  });
}

export function useMaintenanceRecords(vehicleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.maintenanceRecords(vehicleId ?? ''),
    queryFn: () => maintenanceApi.records(vehicleId as string),
    enabled: Boolean(vehicleId) && enabled,
    retry: false,
  });
}

/** Lịch sử KM — chỉ tải khi mở tấm lịch sử, phân trang server-side. */
export function useOdometerHistory(vehicleId: string, page: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.odometerHistory(vehicleId, page),
    queryFn: () => maintenanceApi.odometerHistory(vehicleId, page),
    enabled: Boolean(vehicleId) && enabled,
    retry: false,
  });
}

/**
 * Làm mới mọi bề mặt mà một thay đổi bảo dưỡng/KM đụng tới.
 *
 * Năm nhánh, không phải một: hồ sơ bảo dưỡng của xe · bảng toàn đội xe · nhánh `vehicles` (thẻ
 * xe, chỉ số, cảnh báo) · tổng hợp Hồ sơ 360 · và **lịch** — hoàn tất hay huỷ một phiếu là
 * chiếm/nhả chỗ trên `vehicle_occupancies` (ADR 0006). Bỏ sót nhánh nào là để lại một màn hình
 * kể chuyện cũ cho tới lần tải lại sau.
 */
export function useInvalidateMaintenance(vehicleId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.maintenance(vehicleId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.maintenance.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.summary(vehicleId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
  };
}

export function useSaveMaintenanceProfile(vehicleId: string) {
  const invalidate = useInvalidateMaintenance(vehicleId);
  return useMutation({
    mutationFn: (body: SaveMaintenanceProfileInput) =>
      maintenanceApi.saveProfile(vehicleId, body),
    onSuccess: invalidate,
  });
}

export function useCorrectOdometer(vehicleId: string) {
  const invalidate = useInvalidateMaintenance(vehicleId);
  return useMutation({
    mutationFn: (body: CorrectOdometerInput) => maintenanceApi.correctOdometer(vehicleId, body),
    onSuccess: invalidate,
  });
}

export function useSaveMaintenanceRecord(vehicleId: string) {
  const invalidate = useInvalidateMaintenance(vehicleId);
  return useMutation({
    mutationFn: ({ recordId, body }: { recordId?: string; body: SaveMaintenanceRecordInput }) =>
      recordId
        ? maintenanceApi.updateRecord(vehicleId, recordId, body)
        : maintenanceApi.createRecord(vehicleId, body),
    onSuccess: invalidate,
  });
}

/**
 * Ba chuyển trạng thái của một phiếu. `expectedRowVersion` là khoá lạc quan — hai người cùng mở
 * một phiếu thì người sau nhận 409 thay vì lặng lẽ ghi đè thao tác của người trước.
 */
export function useTransitionMaintenanceRecord(vehicleId: string) {
  const invalidate = useInvalidateMaintenance(vehicleId);
  return useMutation({
    mutationFn: (
      input:
        | { action: 'start'; recordId: string; expectedRowVersion: number }
        | { action: 'cancel'; recordId: string; expectedRowVersion: number }
        | { action: 'complete'; recordId: string; body: CompleteMaintenanceInput },
    ) => {
      if (input.action === 'start') {
        return maintenanceApi.startRecord(vehicleId, input.recordId, input.expectedRowVersion);
      }
      if (input.action === 'cancel') {
        return maintenanceApi.cancelRecord(vehicleId, input.recordId, input.expectedRowVersion);
      }
      return maintenanceApi.completeRecord(vehicleId, input.recordId, input.body);
    },
    onSuccess: invalidate,
  });
}

/** MỘT trang của Trung tâm bảo dưỡng. Lọc, sắp xếp và cắt trang đều ở SERVER. */
export function useMaintenanceBoard(filters: MaintenanceBoardFilters, enabled = true) {
  const params = maintenanceBoardToParams(filters);
  return useQuery({
    queryKey: queryKeys.maintenance.board(params),
    queryFn: () => maintenanceApi.board(filters),
    enabled,
    placeholderData: keepPageData<Awaited<ReturnType<typeof maintenanceApi.board>>>(params),
  });
}

/** Đếm theo nhóm việc — độc lập với trang/bộ lọc hiện tại nên có query key riêng. */
export function useMaintenanceBoardSummary(enabled = true) {
  return useQuery({
    queryKey: queryKeys.maintenance.summary(),
    queryFn: () => maintenanceApi.boardSummary(),
    enabled,
  });
}
