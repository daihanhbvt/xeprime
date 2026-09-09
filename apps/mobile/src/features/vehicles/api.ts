// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { branchesApi, branchLabel } from '@/api/branches/api';
export { uploadsApi } from '@/api/uploads/api';
export { vehiclesApi, vehicleFiltersToParams, VEHICLES_DEFAULT_LIMIT } from '@/api/vehicles/api';

export type { Branch } from '@/api/branches/api';
export type {
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
} from '@/api/vehicles/api';
