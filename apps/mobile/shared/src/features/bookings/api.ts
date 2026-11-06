// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  bookingsApi,
  bookingFiltersToParams,
  historyFiltersToParams,
  BOOKINGS_DEFAULT_LIMIT,
  BOOKING_HISTORY_DEFAULT_LIMIT,
} from '@/api/bookings/api';
export { driversApi } from '@/api/drivers/api';
export { vehiclesApi, vehicleFiltersToParams } from '@/api/vehicles/api';

export type {
  AssignBookingDriverInput,
  BookingDetail,
  BookingDriverSummary,
  BookingDriverHistoryItem,
  BookingDriverIncident,
  BookingExtension,
  BookingExtensionQuote,
  BookingHandoverPrep,
  BookingListMeta,
  BookingHistoryFilters,
  BookingHistoryItem,
  BookingHistoryMeta,
  SetHandoverPrepCheckInput,
  DriverWage,
  DriverWageQuote,
  UpdateDriverWageInput,
  BookingFilters,
  BookingListItem,
  BookingSort,
  CheckConflictInput,
  CheckConflictResult,
  CreateBookingInput,
  TransitionBookingInput,
  UpdateBookingInput,
  UpdateDeliveryFeeInput,
} from '@/api/bookings/api';
export type { AssignableDriver, AssignableWindow } from '@/api/drivers/api';
export type { VehicleFilters, VehicleListItem } from '@/api/vehicles/api';
