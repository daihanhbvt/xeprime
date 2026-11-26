// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  driversApi,
  internalDriversApi,
  driverFiltersToParams,
  driverSharedFilterParams,
  tripFiltersToParams,
  DRIVERS_DEFAULT_LIMIT,
  DRIVER_ASSIGNMENTS_LIMIT,
} from '@/api/drivers/api';

export type {
  AssignableDriver,
  AssignableInternalDriver,
  AssignableWindow,
  CreateInternalDriverInput,
  Driver,
  DriverAccountLookup,
  DriverAssignmentRow,
  DriverCurrentTrip,
  DriverOverview,
  DriverRosterItem,
  DriverRosterSummary,
  DriverSummary,
  DriverTripFilters,
  DriverWageSettings,
  UpdateDriverWageSettingsInput,
  DriverFilters,
  DriverLicenceSummary,
  InternalDriver,
  InternalDriverOverview,
  InternalDriverTripRow,
  InviteDriverInput,
  UpdateDriverInput,
  UpdateInternalDriverInput,
} from '@/api/drivers/api';
