'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { queryKeys } from '@/services/query-keys';
import {
  fetchDriverSurchargeRules,
  fetchVehicleOperationSettings,
  fetchVehicleServiceSettings,
  fetchVehicleTripHistory,
  patchVehicleServiceSetting,
  saveDriverSurchargeRules,
  saveVehicleOperationSettings,
  tripHistoryFiltersToParams,
} from './api';
import type {
  PatchVehicleServiceSettingInput,
  SaveDriverSurchargeRuleInput,
  SaveVehicleOperationSettingsInput,
  VehicleTripHistoryFilters,
} from './types';

/*
 * Mọi mutation ở đây làm mới nhánh `vehicles` (thiết lập, hồ sơ 360, thẻ xe) VÀ nhánh marketplace
 * chi tiết xe: khung giờ, điều khoản, phụ phí và "đặt nhanh" đều hiện ở trang công khai — lưu xong
 * mà trang xe còn nói số cũ là hai màn kể hai chuyện.
 */
function useInvalidateVehicleSettings(vehicleId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.vehicles.operationSettings(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.vehicles.serviceSettings(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.vehicles.driverSurchargeRules(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.marketplace.listing(vehicleId) });
  };
}

export function useVehicleOperationSettings(vehicleId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.vehicles.operationSettings(vehicleId ?? ''),
    queryFn: () => fetchVehicleOperationSettings(vehicleId!),
    enabled: Boolean(vehicleId),
  });
}

export function useSaveVehicleOperationSettings(vehicleId: string) {
  const invalidate = useInvalidateVehicleSettings(vehicleId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveVehicleOperationSettingsInput) =>
      saveVehicleOperationSettings(vehicleId, body),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.vehicles.operationSettings(vehicleId), data);
      invalidate();
    },
  });
}

export function useVehicleServiceSettings(vehicleId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.vehicles.serviceSettings(vehicleId ?? ''),
    queryFn: () => fetchVehicleServiceSettings(vehicleId!),
    enabled: Boolean(vehicleId),
  });
}

export function usePatchVehicleServiceSetting(vehicleId: string, serviceType: string) {
  const invalidate = useInvalidateVehicleSettings(vehicleId);
  return useMutation({
    mutationFn: (body: PatchVehicleServiceSettingInput) =>
      patchVehicleServiceSetting(vehicleId, serviceType, body),
    onSuccess: invalidate,
  });
}

export function useDriverSurchargeRules(vehicleId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.vehicles.driverSurchargeRules(vehicleId ?? ''),
    queryFn: () => fetchDriverSurchargeRules(vehicleId!),
    enabled: Boolean(vehicleId),
  });
}

export function useSaveDriverSurchargeRules(vehicleId: string) {
  const invalidate = useInvalidateVehicleSettings(vehicleId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: SaveDriverSurchargeRuleInput[]) =>
      saveDriverSurchargeRules(vehicleId, items),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.vehicles.driverSurchargeRules(vehicleId), data);
      invalidate();
    },
  });
}

/** Tab + trang của lịch sử chuyến ở URL (ADR 0004) — gửi link được, F5 không mất. */
export function useVehicleTripHistoryFilters() {
  return useUrlFilters<VehicleTripHistoryFilters>((sp) => ({
    filter: sp.get('filter') ?? undefined,
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  }));
}

export function useVehicleTripHistory(vehicleId: string | undefined, filters: VehicleTripHistoryFilters) {
  return useQuery({
    queryKey: queryKeys.vehicles.tripHistory(vehicleId ?? '', tripHistoryFiltersToParams(filters)),
    queryFn: () => fetchVehicleTripHistory(vehicleId!, filters),
    enabled: Boolean(vehicleId),
    // Giữ trang cũ trong lúc tải trang mới — không nháy sang khung xương giữa hai lần bấm.
    placeholderData: (previous) => previous,
  });
}
