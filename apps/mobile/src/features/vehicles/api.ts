// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  vehiclesApi,
  vehicleFiltersToParams,
  branchesApi,
  branchLabel,
  VEHICLES_DEFAULT_LIMIT,
} from '@xeprime/api-client';

export type {
  Branch,
  CreateVehicleInput,
  FleetSummary,
  RentalPolicyValues,
  SaveVehiclePricingInput,
  SaveVehicleSourceInput,
  ShopRentalPolicy,
  SourceContractDownload,
  SourceContractPresign,
  UpdateVehicleInput,
  UploadMeta,
  UploadPresign,
  Vehicle360Summary,
  VehicleAlertGroup,
  VehicleAlertItem,
  VehicleBookingBrief,
  VehicleDetail,
  VehicleFilters,
  VehicleListItem,
  VehiclePricing,
  VehicleSort,
  VehicleSource,
  VehicleSourceContractFile,
  VehicleSourceDetail,
  VehicleStats,
} from '@xeprime/api-client';
