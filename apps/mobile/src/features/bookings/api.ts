// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  bookingsApi,
  bookingFiltersToParams,
  driversApi,
  vehiclesApi,
  vehicleFiltersToParams,
  BOOKINGS_DEFAULT_LIMIT,
} from '@xeprime/api-client';

export type {
  AssignableDriver,
  AssignableWindow,
  BookingDetail,
  BookingDriverSummary,
  BookingFilters,
  BookingListItem,
  BookingSort,
  CheckConflictInput,
  CheckConflictResult,
  CreateBookingInput,
  TransitionBookingInput,
  UpdateBookingInput,
  UpdateDeliveryFeeInput,
  VehicleFilters,
  VehicleListItem,
} from '@xeprime/api-client';
