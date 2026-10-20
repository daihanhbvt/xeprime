// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { DRIVER_LINK_SCOPE, DRIVING_DEFAULT_LIMIT, drivingApi } from '@/api/driving/api';
export type {
  DriverEmployer,
  DriverLinkScope,
  DriverPendingCounts,
  DriverTrip,
  DriverTripDetail,
  MyDriverLink,
} from '@/api/driving/api';
