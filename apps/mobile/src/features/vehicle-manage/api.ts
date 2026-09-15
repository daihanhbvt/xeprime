// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  vehicleSettingsApi,
  tripHistoryFiltersToParams,
  TRIP_HISTORY_PAGE_SIZE,
} from '@/api/vehicle-settings/api';
export type {
  DriverSurchargeRule,
  HandoverWindow,
  PatchVehicleServiceSettingInput,
  SaveDriverSurchargeRuleInput,
  SaveVehicleOperationSettingsInput,
  VehicleOperationSettings,
  VehicleServiceSetting,
  VehicleTripHistoryFilters,
  VehicleTripHistoryItem,
  VehicleTripHistoryPage,
  WithDriverAutoAcceptCapability,
} from '@/api/vehicle-settings/api';
