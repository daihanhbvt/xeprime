import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import {
  apiGet,
  apiPatch,
  apiPut,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type {
  DriverSurchargeRule,
  PatchVehicleServiceSettingInput,
  SaveDriverSurchargeRuleInput,
  SaveVehicleOperationSettingsInput,
  VehicleOperationSettings,
  VehicleServiceSetting,
  VehicleTripHistoryFilters,
  VehicleTripHistoryItem,
} from './types';

export const TRIP_HISTORY_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export const fetchVehicleOperationSettings = (
  vehicleId: string,
): Promise<VehicleOperationSettings> =>
  apiGet<VehicleOperationSettings>(`/vehicles/${vehicleId}/operation-settings`);

export const saveVehicleOperationSettings = (
  vehicleId: string,
  body: SaveVehicleOperationSettingsInput,
): Promise<VehicleOperationSettings> =>
  apiPut<VehicleOperationSettings>(`/vehicles/${vehicleId}/operation-settings`, body);

export const fetchVehicleServiceSettings = async (
  vehicleId: string,
): Promise<VehicleServiceSetting[]> =>
  (await apiGet<{ items: VehicleServiceSetting[] }>(`/vehicles/${vehicleId}/service-settings`))
    .items;

/** PATCH theo dịch vụ — chỉ gửi trường của màn hình đang lưu, server giữ nguyên phần còn lại. */
export const patchVehicleServiceSetting = (
  vehicleId: string,
  serviceType: string,
  body: PatchVehicleServiceSettingInput,
): Promise<VehicleServiceSetting> =>
  apiPatch<VehicleServiceSetting>(
    `/vehicles/${vehicleId}/service-settings/${serviceType}`,
    body,
  );

export const fetchDriverSurchargeRules = async (
  vehicleId: string,
): Promise<DriverSurchargeRule[]> =>
  (await apiGet<{ items: DriverSurchargeRule[] }>(`/vehicles/${vehicleId}/driver-surcharge-rules`))
    .items;

export const saveDriverSurchargeRules = async (
  vehicleId: string,
  items: SaveDriverSurchargeRuleInput[],
): Promise<DriverSurchargeRule[]> =>
  (
    await apiPut<{ items: DriverSurchargeRule[] }>(
      `/vehicles/${vehicleId}/driver-surcharge-rules`,
      { items },
    )
  ).items;

export type VehicleTripHistoryResult = Paged<VehicleTripHistoryItem>;

export function tripHistoryFiltersToParams(filters: VehicleTripHistoryFilters): QueryParams {
  return {
    filter: filters.filter ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? TRIP_HISTORY_DEFAULT_LIMIT,
  };
}

export const fetchVehicleTripHistory = (
  vehicleId: string,
  filters: VehicleTripHistoryFilters,
): Promise<VehicleTripHistoryResult> =>
  fetchPage<VehicleTripHistoryItem>(
    `/vehicles/${vehicleId}/trip-history`,
    tripHistoryFiltersToParams(filters),
    TRIP_HISTORY_DEFAULT_LIMIT,
  );
