import type { components, PaginationMeta, ServiceType } from '@xeprime/types';
import { getApiClient, type QueryParams } from '@xeprime/api-client';

type Schemas = components['schemas'];

export type VehicleOperationSettings = Schemas['VehicleOperationSettingsDto'];
export type SaveVehicleOperationSettingsInput = Schemas['SaveVehicleOperationSettingsDto'];
export type HandoverWindow = Schemas['HandoverWindowDto'];

export type VehicleServiceSetting = Schemas['VehicleServiceSettingDto'];
export type PatchVehicleServiceSettingInput = Schemas['PatchVehicleServiceSettingDto'];
export type WithDriverAutoAcceptCapability = Schemas['WithDriverAutoAcceptCapabilityDto'];

export type DriverSurchargeRule = Schemas['DriverSurchargeRuleDto'];
export type SaveDriverSurchargeRuleInput = Schemas['SaveDriverSurchargeRuleDto'];

export type VehicleTripHistoryItem = Schemas['VehicleTripHistoryItemDto'];

export const TRIP_HISTORY_PAGE_SIZE = 10;

export interface VehicleTripHistoryFilters {
  filter?: string;
  page?: number;
  limit?: number;
}

export function tripHistoryFiltersToParams(filters: VehicleTripHistoryFilters): QueryParams {
  return {
    filter: filters.filter ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? TRIP_HISTORY_PAGE_SIZE,
  };
}

export interface VehicleTripHistoryPage {
  items: VehicleTripHistoryItem[];
  meta: PaginationMeta;
}

/**
 * Thiết lập VẬN HÀNH của một chiếc xe — bản sao cơ học của `apps/web/src/features/vehicle-manage/api.ts`
 * (ADR 0031: mỗi app một tầng gọi API theo nghiệp vụ). Sửa contract là sửa CẢ HAI bản.
 *
 * Bốn nhóm, ba mức phạm vi khác nhau — đó là lý do chúng không gộp vào một endpoint:
 *  - `operation-settings` thuộc về CHIẾC XE (khung giờ giao/nhận, thời gian chết giữa hai chuyến);
 *  - `service-settings` thuộc về XE × DỊCH VỤ (tự nhận chuyến, giấy tờ, điều khoản, cọc có tài xế);
 *  - `driver-surcharge-rules` chỉ có nghĩa với dịch vụ CÓ TÀI XẾ;
 *  - `trip-history` là dữ liệu đọc, phân trang ở server.
 */
export const vehicleSettingsApi = {
  operationSettings(vehicleId: string): Promise<VehicleOperationSettings> {
    return getApiClient().get<VehicleOperationSettings>(
      `/vehicles/${vehicleId}/operation-settings`,
    );
  },

  saveOperationSettings(
    vehicleId: string,
    body: SaveVehicleOperationSettingsInput,
  ): Promise<VehicleOperationSettings> {
    return getApiClient().put<VehicleOperationSettings>(
      `/vehicles/${vehicleId}/operation-settings`,
      body,
    );
  },

  async serviceSettings(vehicleId: string): Promise<VehicleServiceSetting[]> {
    const res = await getApiClient().get<{ items: VehicleServiceSetting[] }>(
      `/vehicles/${vehicleId}/service-settings`,
    );
    return res.items;
  },

  /** PATCH theo dịch vụ — chỉ gửi trường của màn đang lưu, server giữ nguyên phần còn lại. */
  patchServiceSetting(
    vehicleId: string,
    serviceType: ServiceType,
    body: PatchVehicleServiceSettingInput,
  ): Promise<VehicleServiceSetting> {
    return getApiClient().patch<VehicleServiceSetting>(
      `/vehicles/${vehicleId}/service-settings/${serviceType}`,
      body,
    );
  },

  async driverSurchargeRules(vehicleId: string): Promise<DriverSurchargeRule[]> {
    const res = await getApiClient().get<{ items: DriverSurchargeRule[] }>(
      `/vehicles/${vehicleId}/driver-surcharge-rules`,
    );
    return res.items;
  },

  async saveDriverSurchargeRules(
    vehicleId: string,
    items: SaveDriverSurchargeRuleInput[],
  ): Promise<DriverSurchargeRule[]> {
    const res = await getApiClient().put<{ items: DriverSurchargeRule[] }>(
      `/vehicles/${vehicleId}/driver-surcharge-rules`,
      { items },
    );
    return res.items;
  },

  async tripHistory(
    vehicleId: string,
    filters: VehicleTripHistoryFilters,
  ): Promise<VehicleTripHistoryPage> {
    return getApiClient().fetchPage<VehicleTripHistoryItem>(
      `/vehicles/${vehicleId}/trip-history`,
      tripHistoryFiltersToParams(filters),
      filters.limit ?? TRIP_HISTORY_PAGE_SIZE,
    );
  },
};
