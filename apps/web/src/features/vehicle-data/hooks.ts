'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  VEHICLE_DATA_GAP_FILTER_VALUES,
  VEHICLE_DATA_ORIGIN_VALUES,
  VEHICLE_DATA_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { enumParam, positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { queryKeys } from '@/services/query-keys';
import {
  applyVehicleDataImport,
  approveVehicleData,
  createOwnerModel,
  createVehicleData,
  deleteVehicleData,
  discardVehicleDataImport,
  fetchVehicleDataDetail,
  fetchVehicleDataImport,
  fetchVehicleDataImportRows,
  fetchVehicleDataImports,
  fetchVehicleDataModelCounts,
  fetchVehicleDataOptions,
  fetchVehicleDataPage,
  fetchVehicleDataSuggestion,
  mergeVehicleData,
  rejectVehicleData,
  updateVehicleData,
  uploadVehicleDataImport,
  vehicleDataFiltersToParams,
  vehicleDataModelCountsToParams,
  type VehicleDataModelCountsParams,
} from './api';
import type { VehicleDataFilters, VehicleDataInput } from './types';

/** Thứ tự sắp nhận được — khớp DTO server. */
export const VEHICLE_DATA_SORT_VALUES = ['updated_desc', 'name_asc', 'usage_desc'] as const;

/** Đọc bộ lọc dữ liệu xe từ URL - dùng lại ở tab Mẫu xe (thêm tham số riêng của nó). */
export function parseVehicleDataFilters(params: URLSearchParams): VehicleDataFilters {
  return {
    q: params.get('q')?.trim() || undefined,
    vehicleType: enumParam(params, 'vehicleType', VEHICLE_TYPE_VALUES),
    brandKey: params.get('brandKey') || undefined,
    status: enumParam(params, 'status', VEHICLE_DATA_STATUS_VALUES),
    origin: enumParam(params, 'origin', VEHICLE_DATA_ORIGIN_VALUES),
    gap: enumParam(params, 'gap', VEHICLE_DATA_GAP_FILTER_VALUES),
    sort: enumParam(params, 'sort', VEHICLE_DATA_SORT_VALUES),
    page: positiveIntParam(params, 'page'),
    limit: positiveIntParam(params, 'limit'),
    open: params.get('open') || undefined,
  };
}

/** Bộ lọc màn "Dữ liệu xe" trên URL — F5 và gửi link giữ đúng chỗ (ADR 0004). */
export function useVehicleDataFilters() {
  return useUrlFilters(parseVehicleDataFilters);
}

export function useVehicleDataList(filters: VehicleDataFilters) {
  const params = vehicleDataFiltersToParams(filters);
  return useQuery({
    queryKey: queryKeys.vehicleData.list(params),
    queryFn: () => fetchVehicleDataPage(params),
    placeholderData: keepPreviousData,
  });
}

/** Số xe chuẩn theo từng dòng của một hãng (ADR 0096) - giữ số cũ trong lúc đổi bộ lọc. */
export function useVehicleDataModelCounts(params: VehicleDataModelCountsParams) {
  const query = vehicleDataModelCountsToParams(params);
  return useQuery({
    queryKey: queryKeys.vehicleData.modelCounts(query),
    queryFn: () => fetchVehicleDataModelCounts(query),
    placeholderData: keepPreviousData,
  });
}

/** Chi tiết luôn mới: chủ xe có thể vừa sửa xe nguồn của một dòng chờ duyệt. */
export function useVehicleDataDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.vehicleData.detail(id ?? ''),
    queryFn: () => fetchVehicleDataDetail(id as string),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/**
 * Mọi ghi làm mới CẢ nhánh dữ liệu xe lẫn nhánh `catalog` (ô "Dòng xe"/"Phiên bản" + gợi ý của form
 * xe đọc từ đó — admin vừa duyệt là chủ xe thấy ngay).
 */
function useVehicleDataMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicleData.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
      ]);
    },
  });
}

export const useCreateVehicleData = () =>
  useVehicleDataMutation((body: VehicleDataInput) => createVehicleData(body));
export const useUpdateVehicleData = () =>
  useVehicleDataMutation(({ id, body }: { id: string; body: Partial<VehicleDataInput> }) =>
    updateVehicleData(id, body),
  );
export const useDeleteVehicleData = () =>
  useVehicleDataMutation((id: string) => deleteVehicleData(id));
export const useApproveVehicleData = () =>
  useVehicleDataMutation(({ id, note }: { id: string; note?: string }) =>
    approveVehicleData(id, note),
  );
export const useMergeVehicleData = () =>
  useVehicleDataMutation(({ id, targetId }: { id: string; targetId: string }) =>
    mergeVehicleData(id, targetId),
  );
export const useRejectVehicleData = () =>
  useVehicleDataMutation(({ id, reason }: { id: string; reason: string }) =>
    rejectVehicleData(id, reason),
  );

// ── Nhập file ──────────────────────────────────────────────────────────────────────────────────

export function useVehicleDataImports(params: { page: number; limit: number }, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicleData.imports(params),
    queryFn: () => fetchVehicleDataImports(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useVehicleDataImport(id: string | null) {
  return useQuery({
    queryKey: queryKeys.vehicleData.importDetail(id ?? ''),
    queryFn: () => fetchVehicleDataImport(id as string),
    enabled: Boolean(id),
  });
}

export function useVehicleDataImportRows(
  id: string | null,
  params: { action?: string; withIssues?: boolean; page: number; limit: number },
) {
  return useQuery({
    queryKey: queryKeys.vehicleData.importRows(id ?? '', params),
    queryFn: () => fetchVehicleDataImportRows(id as string, params),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

export const useUploadVehicleDataImport = () =>
  useVehicleDataMutation((file: File) => uploadVehicleDataImport(file));
export const useApplyVehicleDataImport = () =>
  useVehicleDataMutation((id: string) => applyVehicleDataImport(id));
export const useDiscardVehicleDataImport = () =>
  useVehicleDataMutation((id: string) => discardVehicleDataImport(id));

// ── Phía chủ xe ────────────────────────────────────────────────────────────────────────────────

/**
 * Ô "Phiên bản" của form xe: xe chuẩn đã duyệt của một dòng, lọc theo năm sản xuất. `includeId` là
 * xe chuẩn đang gắn — luôn có mặt kể cả khi đang chờ duyệt hoặc ngoài đời.
 */
export function useVehicleDataOptions(params: {
  modelId: string | null | undefined;
  year: number | null | undefined;
  includeId: string | null | undefined;
}) {
  const { modelId, year, includeId } = params;
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.catalog.variants(modelId ?? '', year ?? null, includeId ?? ''),
    queryFn: () => fetchVehicleDataOptions({ modelId: modelId!, year, includeId }),
    enabled: Boolean(modelId),
    staleTime: 5 * 60 * 1000,
  });
  return { options: data ?? [], isLoading: Boolean(modelId) && isLoading };
}

/**
 * Gợi ý khi đăng/sửa xe — thông số, giá trị xe, giá thuê tham khảo. Lỗi thì im lặng (`null`): gợi ý
 * là phần thêm, không được chặn việc đăng xe.
 */
export function useVehicleDataSuggestion(params: {
  modelId: string | null | undefined;
  variantId: string | null | undefined;
  year: number | null | undefined;
  vehicleId?: string | null;
}) {
  const { modelId, variantId, year, vehicleId } = params;
  const query = {
    modelId: modelId ?? '',
    variantId: variantId ?? null,
    year: year ?? null,
    vehicleId: vehicleId ?? null,
  };
  const { data } = useQuery({
    queryKey: queryKeys.catalog.suggestion(query),
    queryFn: () => fetchVehicleDataSuggestion({ ...query, modelId: modelId! }),
    enabled: Boolean(modelId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data ?? null;
}

/** Dòng xe chủ xe gõ mới — làm mới danh sách dòng xe để `includeId` thấy nó ngay. */
export function useCreateOwnerModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOwnerModel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
  });
}
