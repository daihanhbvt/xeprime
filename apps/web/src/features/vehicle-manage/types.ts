import type { components } from '@xeprime/types';

/**
 * Shape của không gian "Quản lý xe" (08/09/2026) lấy thẳng từ contract OpenAPI (ADR 0007) —
 * KHÔNG viết tay lại DTO. Đổi DTO backend → `pnpm contract` → các type này tự cập nhật.
 */
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

/** Bộ lọc lịch sử chuyến — sống ở URL searchParams (ADR 0004). */
export interface VehicleTripHistoryFilters {
  filter?: string;
  page?: number;
  limit?: number;
}
