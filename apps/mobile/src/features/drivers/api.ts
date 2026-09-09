// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { driversApi, driverFiltersToParams, DRIVERS_DEFAULT_LIMIT } from '@/api/drivers/api';

export type {
  AssignableDriver,
  AssignableWindow,
  CreateDriverInput,
  Driver,
  DriverFilters,
  UpdateDriverInput,
} from '@/api/drivers/api';
