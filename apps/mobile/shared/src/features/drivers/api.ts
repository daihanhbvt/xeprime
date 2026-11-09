// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { driversApi, driverFiltersToParams, driverSharedFilterParams, DRIVERS_DEFAULT_LIMIT, DRIVER_ASSIGNMENTS_LIMIT } from '@/api/drivers/api';

export type {
  AssignableDriver,
  AssignableWindow,
  Driver,
  DriverAssignmentRow,
  DriverOverview,
  DriverSummary,
  DriverWageSettings,
  UpdateDriverWageSettingsInput,
  DriverFilters,
  DriverLicenceSummary,
  InviteDriverInput,
  UpdateDriverInput,
} from '@/api/drivers/api';
