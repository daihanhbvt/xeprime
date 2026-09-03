// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  bookingRequestsApi,
  bookingRequestFiltersToParams,
  publicQuote,
  deliveryDistance,
  BOOKING_REQUESTS_DEFAULT_LIMIT,
  BOOKING_REQUEST_STATUS_ALL,
  BUSY_DAYS_LOOKAHEAD,
} from '@xeprime/api-client';

export type {
  ApproveBookingRequestInput,
  BookingRequestFilters,
  BookingRequestItem,
  BookingRequestListMeta,
  BookingRequestListResult,
  BookingRequestReceipt,
  CheckAvailabilityResult,
  CreateBookingRequestInput,
  PublicQuote,
  PublicQuoteParams,
  DeliveryDistance,
  VehicleBusyDays,
} from '@xeprime/api-client';
